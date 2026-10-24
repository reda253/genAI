#!/usr/bin/env python3
"""Create/recreate the five Ledger Lens tables and load the generated CSVs.

Usage:
    python data/load_postgres.py

Connection settings come from the repo-root .env when present, with the
development defaults used by infra/docker-compose.yml as a fallback. The schema
and every COPY run in one transaction: a failed load rolls back to the previous
database state.
"""

from __future__ import annotations

import csv
import os
import re
import sys
from decimal import Decimal
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = ROOT / "data" / "schema.sql"
OUT_DIR = ROOT / "data" / "out"

EXPECTED_COUNTS = {
    "clients": 9,
    "subscriptions": 10,
    "invoices": 54,
}

TABLES = (
    (
        "clients",
        "clients.csv",
        (
            "client_id",
            "name",
            "hourly_rate",
            "market_rate",
            "service",
            "payment_terms_days",
            "start_date",
            "active",
        ),
    ),
    (
        "subscriptions",
        "subscriptions.csv",
        (
            "subscription_id",
            "vendor",
            "plan",
            "monthly_cost",
            "billing_day",
            "start_date",
            "cancelled_date",
            "last_login_date",
        ),
    ),
    (
        "invoices",
        "invoices.csv",
        (
            "invoice_id",
            "client_id",
            "issue_date",
            "due_date",
            "paid_date",
            "hours_billed",
            "amount",
            "status",
        ),
    ),
    (
        "time_logs",
        "time_logs.csv",
        (
            "log_id",
            "client_id",
            "date",
            "hours",
            "billable",
            "invoice_id",
            "description",
        ),
    ),
    (
        "bank_transactions",
        "bank_transactions.csv",
        (
            "txn_id",
            "date",
            "amount",
            "counterparty",
            "category",
            "invoice_id",
            "subscription_id",
            "description",
        ),
    ),
)

EXPECTED_INVOICE_REVENUE = Decimal("57222.00")
EXPECTED_CASH_RECEIPTS = Decimal("52422.00")
EXPECTED_CASH_EXPENSES = Decimal("48802.00")
EXPECTED_OPENING_BALANCE = Decimal("4800.00")
EXPECTED_CLOSING_BALANCE = Decimal("8420.00")
EXPECTED_UNBILLED_HOURS = Decimal("22.00")
EXPECTED_UNPAID_INVOICES = ["inv0031", "inv0038"]


def env(name: str, default: str) -> str:
    return os.getenv(name) or default


def connect():
    """Connect using DATABASE_URL or the repo's POSTGRES_* settings."""
    load_dotenv(str(ROOT / ".env"))
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return psycopg2.connect(
            database_url,
            connect_timeout=5,
            application_name="ledger-lens-loader",
        )
    return psycopg2.connect(
        host=env("POSTGRES_HOST", "127.0.0.1"),
        port=env("POSTGRES_PORT", "5433"),
        dbname=env("POSTGRES_DB", "ledger_lens"),
        user=env("POSTGRES_USER", "ledger"),
        password=env("POSTGRES_PASSWORD", "ledger_dev"),
        connect_timeout=5,
        application_name="ledger-lens-loader",
    )


def strip_transaction_control(sql: str) -> str:
    """Let the loader own the transaction, even though schema.sql has BEGIN/COMMIT."""
    return "\n".join(
        line
        for line in sql.splitlines()
        if not re.fullmatch(r"\s*(BEGIN|COMMIT)\s*;\s*", line, re.IGNORECASE)
    )


def csv_row_count(path: Path, columns: tuple[str, ...]) -> int:
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        header = next(reader, None)
        if header != list(columns):
            raise RuntimeError(
                f"{path.name}: expected header {list(columns)}, got {header}"
            )
        return sum(1 for _ in reader)


def copy_table(cursor, table: str, path: Path, columns: tuple[str, ...]) -> None:
    column_sql = ", ".join(f'"{column}"' for column in columns)
    copy_sql = (
        f'COPY "{table}" ({column_sql}) '
        "FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')"
    )
    with path.open("r", encoding="utf-8", newline="") as handle:
        cursor.copy_expert(copy_sql, handle)


def scalar(cursor, sql: str):
    cursor.execute(sql)
    value = cursor.fetchone()[0]
    return value


def verify(cursor, expected_counts: dict[str, int]) -> dict:
    actual_counts = {}
    for table, _, _ in TABLES:
        actual_counts[table] = scalar(cursor, f'SELECT count(*) FROM "{table}"')

    for table, expected in expected_counts.items():
        if actual_counts[table] != expected:
            raise RuntimeError(
                f"{table}: loaded {actual_counts[table]} rows, expected {expected}"
            )
    for table, expected in EXPECTED_COUNTS.items():
        if actual_counts[table] != expected:
            raise RuntimeError(
                f"{table}: loaded {actual_counts[table]} rows, expected {expected}"
            )

    invoice_revenue = scalar(cursor, "SELECT COALESCE(sum(amount), 0) FROM invoices")
    cash_receipts = scalar(
        cursor,
        "SELECT COALESCE(sum(amount), 0) FROM bank_transactions "
        "WHERE category = 'client_payment'",
    )
    cash_expenses = scalar(
        cursor,
        "SELECT COALESCE(-sum(amount), 0) FROM bank_transactions WHERE amount < 0",
    )
    opening_balance = scalar(
        cursor,
        "SELECT COALESCE(sum(amount), 0) FROM bank_transactions "
        "WHERE date = '2026-03-31' AND counterparty = 'Opening balance'",
    )
    closing_balance = scalar(
        cursor,
        "SELECT COALESCE(sum(amount), 0) FROM bank_transactions",
    )
    unbilled_hours = scalar(
        cursor,
        "SELECT COALESCE(sum(hours), 0) FROM time_logs WHERE invoice_id IS NULL",
    )
    cursor.execute(
        "SELECT invoice_id FROM invoices WHERE paid_date IS NULL ORDER BY invoice_id"
    )
    unpaid_invoices = [row[0] for row in cursor.fetchall()]

    checks = (
        ("invoice revenue", invoice_revenue, EXPECTED_INVOICE_REVENUE),
        ("cash receipts", cash_receipts, EXPECTED_CASH_RECEIPTS),
        ("cash expenses", cash_expenses, EXPECTED_CASH_EXPENSES),
        ("opening balance", opening_balance, EXPECTED_OPENING_BALANCE),
        ("closing balance", closing_balance, EXPECTED_CLOSING_BALANCE),
        ("unbilled hours", unbilled_hours, EXPECTED_UNBILLED_HOURS),
    )
    for label, actual, expected in checks:
        if actual != expected:
            raise RuntimeError(f"{label}: got {actual}, expected {expected}")
    if unpaid_invoices != EXPECTED_UNPAID_INVOICES:
        raise RuntimeError(
            f"unpaid invoices: got {unpaid_invoices}, expected {EXPECTED_UNPAID_INVOICES}"
        )

    return {
        "counts": actual_counts,
        "invoice_revenue": invoice_revenue,
        "cash_receipts": cash_receipts,
        "cash_expenses": cash_expenses,
        "opening_balance": opening_balance,
        "closing_balance": closing_balance,
        "unbilled_hours": unbilled_hours,
        "unpaid_invoices": unpaid_invoices,
    }


def load() -> dict:
    required_paths = [SCHEMA_PATH] + [
        OUT_DIR / filename for _, filename, _ in TABLES
    ]
    missing = [str(path) for path in required_paths if not path.exists()]
    if missing:
        raise FileNotFoundError(
            "missing required file(s): "
            + ", ".join(missing)
            + ". Run python data/generate.py first."
        )

    schema_sql = strip_transaction_control(SCHEMA_PATH.read_text(encoding="utf-8"))
    expected_counts = {
        table: csv_row_count(OUT_DIR / filename, columns)
        for table, filename, columns in TABLES
    }

    connection = connect()
    try:
        with connection.cursor() as cursor:
            cursor.execute(schema_sql)
            for table, filename, columns in TABLES:
                copy_table(cursor, table, OUT_DIR / filename, columns)
            metrics = verify(cursor, expected_counts)
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
    return metrics


def main() -> int:
    try:
        metrics = load()
    except FileNotFoundError as exc:
        print(f"load failed: {exc}", file=sys.stderr)
        return 1
    except psycopg2.Error as exc:
        print(f"database error: {str(exc).strip()}", file=sys.stderr)
        return 1
    except RuntimeError as exc:
        print(f"verification failed: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"load failed: {exc}", file=sys.stderr)
        return 1

    counts = metrics["counts"]
    print(
        "loaded "
        f"{counts['clients']} clients, {counts['subscriptions']} subscriptions, "
        f"{counts['invoices']} invoices, {counts['time_logs']} time logs, "
        f"{counts['bank_transactions']} bank transactions"
    )
    print(
        f"invoice revenue EUR {metrics['invoice_revenue']:.2f}; "
        f"cash receipts EUR {metrics['cash_receipts']:.2f}; "
        f"cash expenses EUR {metrics['cash_expenses']:.2f}; "
        f"opening EUR {metrics['opening_balance']:.2f}; "
        f"closing EUR {metrics['closing_balance']:.2f}"
    )
    print(
        f"unbilled hours {metrics['unbilled_hours']:.2f}; "
        f"unpaid invoices {', '.join(metrics['unpaid_invoices'])}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
