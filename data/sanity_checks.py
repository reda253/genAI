#!/usr/bin/env python3
"""Read-only sanity checks for the Ledger Lens Postgres dataset.

Usage:
    python data/load_postgres.py
    python data/sanity_checks.py

The script exits 0 only when every invariant, leak threshold, negative-control
check, and answer-key value matches the generated dataset.
"""

from __future__ import annotations

import json
import os
import sys
from collections import Counter, defaultdict
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
ANSWER_KEY_PATH = ROOT / "data" / "answer_key.json"

START_DATE = date(2026, 4, 1)
END_DATE = date(2026, 9, 30)
TODAY = date(2026, 10, 1)
OPENING_DATE = date(2026, 3, 31)
MONTHS = (4, 5, 6, 7, 8, 9)

EXPECTED_COUNTS = {
    "clients": 9,
    "subscriptions": 10,
    "invoices": 54,
}

EXPECTED_CLIENTS = {
    "c01": ("Atlas Co", Decimal("60.00"), Decimal("65.00"), "branding", 30),
    "c02": ("Meridian Health", Decimal("85.00"), Decimal("85.00"), "ui_design", 30),
    "c03": ("Stone & Finch", Decimal("72.50"), Decimal("75.00"), "branding", 15),
    "c04": ("Nordwind Studio", Decimal("60.00"), Decimal("60.00"), "illustration", 30),
    "c05": ("Lumen Labs", Decimal("90.00"), Decimal("95.00"), "ui_design", 30),
    "c06": ("Harbor & Co", Decimal("68.00"), Decimal("70.00"), "branding", 45),
    "c07": ("Kestrel Books", Decimal("42.00"), Decimal("60.00"), "illustration", 45),
    "c08": ("Vela Coffee", Decimal("65.00"), Decimal("65.00"), "branding", 15),
    "c09": ("Orbit Fitness", Decimal("78.00"), Decimal("80.00"), "ui_design", 30),
}
EXPECTED_CLIENT_START_DATES = {
    "c01": date(2024, 2, 1),
    "c02": date(2024, 6, 15),
    "c03": date(2025, 1, 10),
    "c04": date(2024, 9, 1),
    "c05": date(2025, 3, 1),
    "c06": date(2023, 11, 15),
    "c07": date(2024, 4, 1),
    "c08": date(2025, 6, 1),
    "c09": date(2025, 9, 1),
}
EXPECTED_CLIENT_MONTH_HOURS = {
    "c01": {4: 40, 5: 40, 6: 40, 7: 40, 8: 52, 9: 50},
    "c02": {4: 15, 5: 15, 6: 15, 7: 15, 8: 15, 9: 15},
    "c03": {4: 10, 5: 10, 6: 10, 7: 10, 8: 10, 9: 10},
    "c04": {4: 30, 5: 30, 6: 40, 7: 40, 8: 30, 9: 30},
    "c05": {4: 6, 5: 6, 6: 6, 7: 6, 8: 6, 9: 6},
    "c06": {4: 8, 5: 8, 6: 8, 7: 8, 8: 8, 9: 8},
    "c07": {4: 30, 5: 30, 6: 30, 7: 30, 8: 30, 9: 30},
    "c08": {4: 5, 5: 5, 6: 5, 7: 5, 8: 5, 9: 5},
    "c09": {4: 6, 5: 6, 6: 6, 7: 6, 8: 6, 9: 6},
}
EXPECTED_SUBSCRIPTIONS = {
    "sub01": ("Google Workspace", "Business Standard", Decimal("12.00"), 2, date(2024, 2, 1), date(2026, 9, 30)),
    "sub02": ("Adobe", "Creative Cloud All Apps", Decimal("80.99"), 5, date(2024, 3, 1), date(2026, 9, 29)),
    "sub03": ("Figma", "Professional", Decimal("15.00"), 20, date(2024, 5, 1), date(2026, 9, 28)),
    "sub04": ("Dropbox", "Plus", Decimal("11.99"), 10, date(2024, 7, 1), date(2026, 9, 20)),
    "sub05": ("Webflow", "CMS", Decimal("29.00"), 12, date(2024, 8, 1), date(2026, 6, 29)),
    "sub06": ("Framer", "Pro", Decimal("20.00"), 8, date(2025, 1, 1), date(2026, 9, 27)),
    "sub07": ("Vercel", "Pro", Decimal("20.00"), 15, date(2025, 2, 1), date(2026, 9, 25)),
    "sub08": ("Notion", "Plus", Decimal("10.00"), 18, date(2024, 10, 1), date(2026, 9, 15)),
    "sub09": ("Loom", "Business", Decimal("12.50"), 22, date(2025, 3, 1), date(2026, 8, 25)),
    "sub10": ("Miro", "Starter", Decimal("8.00"), 25, date(2025, 5, 1), date(2026, 8, 10)),
}

EXPECTED_HOURS_BY_MONTH = {
    4: Decimal("150.00"),
    5: Decimal("150.00"),
    6: Decimal("160.00"),
    7: Decimal("160.00"),
    8: Decimal("162.00"),
    9: Decimal("160.00"),
}
EXPECTED_REVENUE_BY_MONTH = {
    4: Decimal("9337.00"),
    5: Decimal("9337.00"),
    6: Decimal("9937.00"),
    7: Decimal("9937.00"),
    8: Decimal("9337.00"),
    9: Decimal("9337.00"),
}
EXPECTED_RECEIPTS_BY_MONTH = {
    4: Decimal("9337.00"),
    5: Decimal("8793.00"),
    6: Decimal("7537.00"),
    7: Decimal("7537.00"),
    8: Decimal("9156.00"),
    9: Decimal("10062.00"),
}
EXPECTED_UNPAID = {
    "inv0031": (date(2026, 8, 15), 47),
    "inv0038": (date(2026, 8, 29), 33),
}
EXPECTED_ANSWER_KEY = {
    "unbilled_hours": ("c01", None, Decimal("1320.00")),
    "price_rise": (None, "sub02", Decimal("14.00")),
    "unused_subscription": (None, "sub05", Decimal("29.00")),
    "late_payer": ("c04", None, Decimal("0.00")),
    "underpriced_service": ("c07", None, Decimal("540.00")),
    "duplicate_charge": (None, "sub03", Decimal("15.00")),
}
CATEGORIES = {
    "client_payment",
    "subscription",
    "software",
    "rent",
    "tax",
    "travel",
    "personal",
    "other",
}


class Checker:
    def __init__(self) -> None:
        self.checks = 0
        self.failures: list[str] = []
        self._section = ""
        self._section_failures = 0

    def start(self, name: str) -> None:
        self._section = name
        self._section_failures = len(self.failures)

    def check(self, condition: bool, message: str) -> None:
        self.checks += 1
        if not condition:
            self.failures.append(f"{self._section}: {message}")

    def equal(self, actual, expected, label: str) -> None:
        self.check(actual == expected, f"{label}: expected {expected!r}, got {actual!r}")

    def finish(self) -> None:
        failed = len(self.failures) - self._section_failures
        print(f"[{'FAIL' if failed else 'ok'}] {self._section}")


def env(name: str, default: str) -> str:
    return os.getenv(name) or default


def connect():
    load_dotenv(str(ROOT / ".env"))
    database_url = os.getenv("DATABASE_URL")
    if database_url:
        return psycopg2.connect(
            database_url,
            connect_timeout=5,
            application_name="ledger-lens-sanity-checks",
        )
    return psycopg2.connect(
        host=env("POSTGRES_HOST", "127.0.0.1"),
        port=env("POSTGRES_PORT", "5433"),
        dbname=env("POSTGRES_DB", "ledger_lens"),
        user=env("POSTGRES_USER", "ledger"),
        password=env("POSTGRES_PASSWORD", "ledger_dev"),
        connect_timeout=5,
        application_name="ledger-lens-sanity-checks",
    )


def fetch_one(cursor, sql: str):
    cursor.execute(sql)
    row = cursor.fetchone()
    return row[0] if row else None


def fetch_all(cursor, sql: str) -> list[tuple]:
    cursor.execute(sql)
    return list(cursor.fetchall())


def month_last_day(month: int) -> date:
    if month == 12:
        return date(2026, 12, 31)
    return date(2026, month + 1, 1) - timedelta(days=1)


def check_row_counts(cursor, checker: Checker) -> dict[str, int]:
    checker.start("row counts")
    counts = {
        table: fetch_one(cursor, f'SELECT count(*) FROM "{table}"')
        for table in ("clients", "subscriptions", "invoices", "time_logs", "bank_transactions")
    }
    for table, expected in EXPECTED_COUNTS.items():
        checker.equal(counts[table], expected, f"{table} row count")
    checker.check(counts["time_logs"] > 0, "time_logs is empty")
    checker.check(counts["bank_transactions"] > 0, "bank_transactions is empty")
    checker.finish()
    return counts


def check_clients(cursor, checker: Checker) -> None:
    checker.start("clients")
    rows = fetch_all(
        cursor,
        "SELECT client_id, name, hourly_rate, market_rate, service, "
        "payment_terms_days, start_date, active FROM clients ORDER BY client_id",
    )
    checker.equal(len(rows), 9, "client count")
    checker.equal({row[0] for row in rows}, set(EXPECTED_CLIENTS), "client IDs")

    for row in rows:
        client_id, name, rate, market, service, terms, start_date, active = row
        expected = EXPECTED_CLIENTS.get(client_id)
        checker.check(expected is not None, f"{client_id}: unexpected client")
        if expected is not None:
            expected_name, expected_rate, expected_market, expected_service, expected_terms = expected
            checker.equal(name, expected_name, f"{client_id} name")
            checker.equal(rate, expected_rate, f"{client_id} hourly_rate")
            checker.equal(market, expected_market, f"{client_id} market_rate")
            checker.equal(service, expected_service, f"{client_id} service")
            checker.equal(terms, expected_terms, f"{client_id} payment_terms_days")
        checker.equal(start_date, EXPECTED_CLIENT_START_DATES.get(client_id), f"{client_id} start_date")
        checker.check(rate > 0 and market > 0, f"{client_id}: non-positive rate")
        checker.check(start_date < START_DATE, f"{client_id}: start_date after window")
        checker.check(active is True, f"{client_id}: inactive")

    checker.finish()


def check_invoices(cursor, checker: Checker) -> None:
    checker.start("invoices")
    rows = fetch_all(
        cursor,
        "SELECT i.invoice_id, i.client_id, i.issue_date, i.due_date, i.paid_date, "
        "i.hours_billed, i.amount, i.status, c.hourly_rate, c.payment_terms_days "
        "FROM invoices i JOIN clients c ON c.client_id = i.client_id "
        "ORDER BY i.invoice_id",
    )
    checker.equal(len(rows), 54, "invoice count")
    per_client = Counter(row[1] for row in rows)
    for client_id in EXPECTED_CLIENTS:
        checker.equal(per_client[client_id], 6, f"{client_id} invoice count")

    for row in rows:
        invoice_id, client_id, issue_date, due_date, paid_date, hours, amount, status, rate, terms = row
        checker.equal(amount, hours * rate, f"{invoice_id}: amount != hours * rate")
        checker.equal(due_date, issue_date + timedelta(days=terms), f"{invoice_id}: due date")
        checker.equal(status == "paid", paid_date is not None, f"{invoice_id}: status/paid_date")
        checker.check(paid_date is None or paid_date >= issue_date, f"{invoice_id}: paid before issue")
        checker.check(paid_date is None or paid_date <= END_DATE, f"{invoice_id}: paid after window")
        checker.check(hours > 0 and amount >= 0, f"{invoice_id}: invalid hours/amount")

    unpaid = [row for row in rows if row[4] is None]
    checker.equal([row[0] for row in unpaid], ["inv0031", "inv0038"], "unpaid invoice IDs")
    for row in unpaid:
        invoice_id, client_id, issue_date, due_date, paid_date, hours, amount, status, rate, terms = row
        expected = EXPECTED_UNPAID.get(invoice_id)
        checker.equal(client_id, "c04", f"{invoice_id}: client")
        checker.equal(amount, Decimal("2400.00"), f"{invoice_id}: amount")
        checker.equal(status, "overdue", f"{invoice_id}: status")
        if expected is not None:
            checker.equal(due_date, expected[0], f"{invoice_id}: due date")
            checker.equal((TODAY - due_date).days, expected[1], f"{invoice_id}: days late")

    late_paid = sorted(
        (row[1], (row[4] - row[3]).days)
        for row in rows
        if row[4] is not None and row[4] > row[3]
    )
    checker.equal(late_paid, [("c03", 8), ("c06", 20)], "late paid invoices")
    payment_lag = sorted(
        (row[1], (row[4] - row[2]).days)
        for row in rows
        if row[4] is not None and row[4] != row[2]
    )
    checker.equal(payment_lag, [("c03", 23), ("c06", 65)], "payment lag from issue")

    payment_rows = fetch_all(
        cursor,
        "SELECT invoice_id, date, amount FROM bank_transactions "
        "WHERE category = 'client_payment' ORDER BY invoice_id",
    )
    payments_by_invoice = defaultdict(list)
    for invoice_id, paid_on, amount in payment_rows:
        payments_by_invoice[invoice_id].append((paid_on, amount))
    for row in rows:
        invoice_id, client_id, issue_date, due_date, paid_date, hours, amount, status, rate, terms = row
        payments = payments_by_invoice.get(invoice_id, [])
        if paid_date is None:
            checker.equal(payments, [], f"{invoice_id}: unpaid invoice has payment")
        else:
            checker.equal(len(payments), 1, f"{invoice_id}: payment count")
            if payments:
                checker.equal(payments[0], (paid_date, amount), f"{invoice_id}: payment amount/date")
    checker.equal(
        len(payment_rows),
        sum(1 for row in rows if row[4] is not None),
        "client payment count",
    )

    invoice_revenue = sum((row[6] for row in rows), Decimal("0.00"))
    checker.equal(invoice_revenue, Decimal("57222.00"), "invoice revenue")

    work_rows = fetch_all(
        cursor,
        "SELECT i.invoice_id, i.client_id, i.issue_date, i.hours_billed, i.amount, "
        "min(tl.date), max(tl.date), coalesce(sum(tl.hours), 0), "
        "count(*) FILTER (WHERE tl.client_id <> i.client_id) "
        "FROM invoices i LEFT JOIN time_logs tl ON tl.invoice_id = i.invoice_id "
        "GROUP BY i.invoice_id, i.client_id, i.issue_date, i.hours_billed, i.amount "
        "ORDER BY i.invoice_id",
    )
    checker.equal(len(work_rows), 54, "invoiced work-month rows")
    revenue_by_month = defaultdict(lambda: Decimal("0.00"))
    for row in work_rows:
        invoice_id, client_id, issue_date, hours, amount, first_log, last_log, logged, wrong_client = row
        checker.check(first_log is not None, f"{invoice_id}: no linked time logs")
        if first_log is None or last_log is None:
            continue
        checker.equal(first_log.year, 2026, f"{invoice_id}: work year")
        checker.equal(first_log.month, last_log.month, f"{invoice_id}: spans work months")
        checker.equal(logged, hours, f"{invoice_id}: logged != hours_billed")
        checker.equal(wrong_client, 0, f"{invoice_id}: log client mismatch")
        checker.check(last_log <= issue_date, f"{invoice_id}: log after issue date")
        month = first_log.month
        revenue_by_month[month] += amount
        if invoice_id == "inv0031":
            checker.equal(month, 6, "inv0031 work month")
            checker.equal(issue_date, date(2026, 7, 16), "inv0031 issue date")
        elif invoice_id == "inv0038":
            checker.equal(month, 7, "inv0038 work month")
            checker.equal(issue_date, date(2026, 7, 30), "inv0038 issue date")
        else:
            checker.equal(issue_date, month_last_day(month), f"{invoice_id}: issue date")

    checker.equal(dict(revenue_by_month), EXPECTED_REVENUE_BY_MONTH, "revenue by work month")
    checker.finish()


def check_time_logs(cursor, checker: Checker) -> None:
    checker.start("time logs")
    checker.equal(
        fetch_one(cursor, "SELECT count(*) FROM time_logs WHERE NOT billable"),
        0,
        "non-billable logs",
    )
    checker.equal(
        fetch_one(
            cursor,
            "SELECT count(*) FROM time_logs "
            "WHERE date < DATE '2026-04-01' OR date > DATE '2026-09-30'",
        ),
        0,
        "logs outside data window",
    )
    checker.equal(
        fetch_one(cursor, "SELECT count(*) FROM time_logs WHERE hours <= 0 OR hours > 24"),
        0,
        "invalid log hours",
    )

    unbilled = fetch_all(
        cursor,
        "SELECT client_id, extract(month FROM date)::int, sum(hours) "
        "FROM time_logs WHERE invoice_id IS NULL GROUP BY 1, 2 ORDER BY 1, 2",
    )
    checker.equal(
        unbilled,
        [("c01", 8, Decimal("12.00")), ("c01", 9, Decimal("10.00"))],
        "unbilled logs",
    )
    checker.equal(
        sum((row[2] for row in unbilled), Decimal("0.00")),
        Decimal("22.00"),
        "unbilled hours total",
    )

    monthly = fetch_all(
        cursor,
        "SELECT extract(month FROM date)::int, sum(hours) "
        "FROM time_logs GROUP BY 1 ORDER BY 1",
    )
    checker.equal(dict(monthly), EXPECTED_HOURS_BY_MONTH, "hours by month")
    checker.equal(
        sum((row[1] for row in monthly), Decimal("0.00")),
        Decimal("942.00"),
        "total logged hours",
    )

    client_month = fetch_all(
        cursor,
        "SELECT client_id, extract(month FROM date)::int, sum(hours) "
        "FROM time_logs GROUP BY 1, 2 ORDER BY 1, 2",
    )
    actual_client_month = defaultdict(dict)
    for client_id, month, hours in client_month:
        actual_client_month[client_id][month] = hours
    checker.equal(
        set(actual_client_month),
        set(EXPECTED_CLIENT_MONTH_HOURS),
        "client/month hour coverage",
    )
    for client_id, expected in EXPECTED_CLIENT_MONTH_HOURS.items():
        checker.equal(
            actual_client_month.get(client_id),
            {month: Decimal(hours) for month, hours in expected.items()},
            f"{client_id}: monthly hours",
        )
    checker.equal(
        fetch_one(
            cursor,
            "SELECT count(*) FROM time_logs tl JOIN invoices i "
            "ON i.invoice_id = tl.invoice_id WHERE tl.date > i.issue_date",
        ),
        0,
        "logs dated after invoice issue",
    )
    checker.finish()


def check_subscriptions(cursor, checker: Checker) -> None:
    checker.start("subscriptions")
    subs = fetch_all(
        cursor,
        "SELECT subscription_id, vendor, plan, monthly_cost, billing_day, "
        "start_date, cancelled_date, last_login_date FROM subscriptions "
        "ORDER BY subscription_id",
    )
    checker.equal(len(subs), 10, "subscription count")
    checker.equal({row[0] for row in subs}, set(EXPECTED_SUBSCRIPTIONS), "subscription IDs")
    subs_by_id = {row[0]: row for row in subs}
    checker.equal(
        sum((row[3] for row in subs), Decimal("0.00")),
        Decimal("219.48"),
        "current list price total",
    )
    checker.check(all(row[6] is None for row in subs), "cancelled subscriptions")
    checker.check(all(row[7] is not None and row[7] <= TODAY for row in subs), "missing/future last login")
    checker.check(all(row[5] < START_DATE for row in subs), "subscription starts after window")
    checker.check(all(1 <= row[4] <= 28 for row in subs), "invalid billing day")

    charges = fetch_all(
        cursor,
        "SELECT subscription_id, date, amount FROM bank_transactions "
        "WHERE category = 'subscription' ORDER BY subscription_id, date, txn_id",
    )
    checker.equal(len(charges), 61, "subscription charge count")
    checker.check(all(amount < 0 for _, _, amount in charges), "subscription charge sign")
    checker.equal(
        sum((-amount for _, _, amount in charges), Decimal("0.00")),
        Decimal("1303.88"),
        "subscription charges total",
    )

    charge_by_sub = defaultdict(list)
    charge_counts = defaultdict(int)
    for subscription_id, charge_date, amount in charges:
        charge_by_sub[subscription_id].append((charge_date, amount))
        charge_counts[(subscription_id, charge_date.month)] += 1

    for row in subs:
        subscription_id = row[0]
        expected_sub = EXPECTED_SUBSCRIPTIONS.get(subscription_id)
        checker.check(expected_sub is not None, f"{subscription_id}: unexpected subscription")
        if expected_sub is not None:
            vendor, plan, monthly_cost, billing_day, start_date, last_login = expected_sub
            checker.equal(row[1], vendor, f"{subscription_id} vendor")
            checker.equal(row[2], plan, f"{subscription_id} plan")
            checker.equal(row[3], monthly_cost, f"{subscription_id} monthly_cost")
            checker.equal(row[4], billing_day, f"{subscription_id} billing_day")
            checker.equal(row[5], start_date, f"{subscription_id} start_date")
            checker.equal(row[7], last_login, f"{subscription_id} last_login_date")
        items = charge_by_sub[subscription_id]
        checker.check(bool(items), f"{subscription_id}: no charges")
        checker.equal({charge_date.month for charge_date, _ in items}, set(MONTHS), f"{subscription_id}: charge months")
        for month in MONTHS:
            expected_count = 2 if subscription_id == "sub03" and month == 8 else 1
            checker.equal(
                charge_counts[(subscription_id, month)],
                expected_count,
                f"{subscription_id}/{month}: charge count",
            )
        amounts = [abs(amount) for _, amount in items]
        if subscription_id == "sub02":
            checker.equal(
                amounts,
                [
                    Decimal("66.99"),
                    Decimal("66.99"),
                    Decimal("80.99"),
                    Decimal("80.99"),
                    Decimal("80.99"),
                    Decimal("80.99"),
                ],
                "Adobe charge history",
            )
        elif subscription_id == "sub03":
            checker.equal(set(amounts), {Decimal("15.00")}, "Figma charge amount")
        elif subscription_id == "sub05":
            checker.equal(set(amounts), {Decimal("29.00")}, "Webflow charge amount")
        else:
            checker.equal(set(amounts), {row[3]}, f"{subscription_id}: price changed")
        if amounts:
            first_amount, last_amount = amounts[0], amounts[-1]
            change_pct = (last_amount - first_amount) / first_amount * 100
            if subscription_id == "sub02":
                checker.equal(round(change_pct, 1), Decimal("20.9"), "Adobe price change pct")
            else:
                checker.check(change_pct <= Decimal("5"), f"{subscription_id}: unexpected price rise")
        max_charges = max(charge_counts[(subscription_id, month)] for month in MONTHS)
        checker.equal(
            max_charges,
            2 if subscription_id == "sub03" else 1,
            f"{subscription_id}: max charges in a month",
        )
        days_since_login = (TODAY - row[7]).days
        if subscription_id == "sub05":
            checker.equal(row[7], date(2026, 6, 29), "Webflow last login")
            checker.equal(days_since_login, 94, "Webflow days since login")
        else:
            checker.check(days_since_login < 60, f"{subscription_id}: unused subscription")

    checker.equal(
        subs_by_id["sub02"][3], Decimal("80.99"), "Adobe current monthly_cost"
    )
    checker.equal(
        subs_by_id["sub03"][3], Decimal("15.00"), "Figma current monthly_cost"
    )
    checker.equal(
        subs_by_id["sub05"][3], Decimal("29.00"), "Webflow current monthly_cost"
    )
    checker.equal(
        sum((abs(amount) for _, amount in charge_by_sub["sub03"]), Decimal("0.00")),
        Decimal("105.00"),
        "Figma total charged",
    )
    checker.equal(
        sum((abs(amount) for _, amount in charge_by_sub["sub05"]), Decimal("0.00")),
        Decimal("174.00"),
        "Webflow total charged",
    )
    figma_august = [
        (charge_date, abs(amount))
        for charge_date, amount in charge_by_sub["sub03"]
        if charge_date.month == 8
    ]
    checker.equal(
        figma_august,
        [(date(2026, 8, 20), Decimal("15.00")), (date(2026, 8, 22), Decimal("15.00"))],
        "Figma August charges",
    )
    healthy_days = [
        (TODAY - row[7]).days for row in subs if row[0] != "sub05"
    ]
    checker.equal(max(healthy_days), 52, "closest healthy last login")
    checker.finish()


def check_cash(cursor, checker: Checker) -> None:
    checker.start("cash")
    rows = fetch_all(
        cursor,
        "SELECT txn_id, date, amount, category, invoice_id, subscription_id, "
        "counterparty, description FROM bank_transactions ORDER BY date, txn_id",
    )
    checker.check(bool(rows), "bank_transactions is empty")
    checker.equal(len({row[0] for row in rows}), len(rows), "duplicate transaction IDs")
    checker.check(all(row[3] in CATEGORIES for row in rows), "invalid category")
    checker.equal(sum(1 for row in rows if row[2] == 0), 0, "zero-amount transactions")

    opening = [row for row in rows if row[1] == OPENING_DATE]
    checker.equal(len(opening), 1, "opening-balance row count")
    if opening:
        checker.equal(opening[0][2], Decimal("4800.00"), "opening balance")
        checker.equal(opening[0][3], "other", "opening category")
        checker.equal(opening[0][4], None, "opening invoice link")
        checker.equal(opening[0][5], None, "opening subscription link")
        checker.equal(opening[0][6], "Opening balance", "opening counterparty")
        checker.check(opening[0][2] > 0, "opening balance sign")
        checker.equal(opening[0][7], "Opening balance brought forward", "opening description")

    outside = [
        row for row in rows
        if row[1] != OPENING_DATE and not (START_DATE <= row[1] <= END_DATE)
    ]
    checker.equal(len(outside), 0, "transactions outside data window")
    positives = [row for row in rows if row[2] > 0]
    checker.check(
        all(row[3] == "client_payment" or row[1] == OPENING_DATE for row in positives),
        "non-client-payment inflow",
    )
    checker.check(
        all(row[2] > 0 for row in rows if row[3] == "client_payment"),
        "client payment sign",
    )
    bad_signs = [
        row for row in rows
        if row[1] != OPENING_DATE and row[3] != "client_payment" and row[2] >= 0
    ]
    checker.equal(len(bad_signs), 0, "non-client-payment inflow or zero expense")

    receipts = sum(
        (row[2] for row in rows if row[3] == "client_payment"), Decimal("0.00")
    )
    expenses = -sum((row[2] for row in rows if row[2] < 0), Decimal("0.00"))
    closing = sum((row[2] for row in rows), Decimal("0.00"))
    checker.equal(receipts, Decimal("52422.00"), "cash receipts")
    checker.equal(expenses, Decimal("48802.00"), "cash expenses")
    checker.equal(closing, Decimal("8420.00"), "closing balance")
    checker.equal(
        Decimal("4800.00") + receipts - expenses,
        closing,
        "opening + receipts - expenses = closing",
    )
    checker.equal(
        sum(1 for row in rows if row[3] == "client_payment"),
        52,
        "client payment count",
    )
    checker.equal(
        sum(1 for row in rows if row[3] == "subscription"),
        61,
        "subscription charge count",
    )
    checker.equal(
        sum(1 for row in rows if row[3] == "personal"),
        6,
        "personal draw count",
    )

    receipts_by_month = defaultdict(lambda: Decimal("0.00"))
    for row in rows:
        if row[3] == "client_payment":
            receipts_by_month[row[1].month] += row[2]
    checker.equal(dict(receipts_by_month), EXPECTED_RECEIPTS_BY_MONTH, "receipts by month")

    draws = [row for row in rows if row[3] == "personal"]
    checker.equal(
        sum((row[2] for row in draws), Decimal("0.00")),
        Decimal("-29762.12"),
        "personal draw total",
    )
    checker.equal(
        sum((row[2] for row in rows if row[3] == "subscription"), Decimal("0.00")),
        Decimal("-1303.88"),
        "subscription cash total",
    )

    bad_links = []
    for row in rows:
        category, invoice_id, subscription_id = row[3], row[4], row[5]
        if category == "client_payment":
            if invoice_id is None or subscription_id is not None:
                bad_links.append(row[0])
        elif category == "subscription":
            if subscription_id is None or invoice_id is not None:
                bad_links.append(row[0])
        elif invoice_id is not None or subscription_id is not None:
            bad_links.append(row[0])
    checker.check(not bad_links, f"invalid transaction links: {bad_links[:3]}")

    balance = Decimal("0.00")
    negative = []
    for row in rows:
        balance += row[2]
        if balance < 0:
            negative.append((row[0], balance))
    checker.equal(len(negative), 0, "negative running balance")
    checker.equal(balance, Decimal("8420.00"), "transaction-order closing balance")

    daily = defaultdict(lambda: Decimal("0.00"))
    for row in rows:
        daily[row[1]] += row[2]
    daily_balance = Decimal("0.00")
    daily_negative = []
    for day in sorted(daily):
        daily_balance += daily[day]
        if daily_balance < 0:
            daily_negative.append((day, daily_balance))
    checker.equal(len(daily_negative), 0, "negative daily balance")
    checker.equal(daily_balance, Decimal("8420.00"), "daily closing balance")
    checker.finish()


def check_leak_thresholds(cursor, checker: Checker) -> None:
    checker.start("leak thresholds")
    unbilled_clients = [
        row[0]
        for row in fetch_all(
            cursor,
            "SELECT DISTINCT client_id FROM time_logs "
            "WHERE invoice_id IS NULL ORDER BY client_id",
        )
    ]
    checker.equal(unbilled_clients, ["c01"], "unbilled entities")

    charges = fetch_all(
        cursor,
        "SELECT subscription_id, date, amount FROM bank_transactions "
        "WHERE category = 'subscription' ORDER BY subscription_id, date, txn_id",
    )
    charges_by_sub = defaultdict(list)
    for subscription_id, charge_date, amount in charges:
        charges_by_sub[subscription_id].append((charge_date, amount))
    price_rise_subs = []
    for subscription_id, items in charges_by_sub.items():
        if len(items) < 2:
            continue
        first_amount = abs(items[0][1])
        last_amount = abs(items[-1][1])
        change_pct = (last_amount - first_amount) / first_amount * 100
        if change_pct > Decimal("15"):
            price_rise_subs.append(subscription_id)
    checker.equal(sorted(price_rise_subs), ["sub02"], "price-rise subscriptions")

    unused_subs = [
        row[0]
        for row in fetch_all(
            cursor,
            "SELECT subscription_id FROM subscriptions "
            "WHERE cancelled_date IS NULL AND last_login_date < DATE '2026-10-01' - 60 "
            "ORDER BY subscription_id",
        )
    ]
    checker.equal(unused_subs, ["sub05"], "unused subscriptions")

    late_clients = [
        row[0]
        for row in fetch_all(
            cursor,
            "SELECT DISTINCT client_id FROM invoices "
            "WHERE (paid_date IS NULL AND due_date < DATE '2026-10-01') "
            "OR (paid_date IS NOT NULL AND paid_date > due_date + 30) "
            "ORDER BY client_id",
        )
    ]
    checker.equal(late_clients, ["c04"], "late-payer clients")

    underpriced_clients = [
        row[0]
        for row in fetch_all(
            cursor,
            "SELECT client_id FROM clients WHERE hourly_rate < market_rate * 0.9 "
            "ORDER BY client_id",
        )
    ]
    checker.equal(underpriced_clients, ["c07"], "underpriced clients")

    duplicate_charges = fetch_all(
        cursor,
        "SELECT subscription_id, date_trunc('month', date)::date "
        "FROM bank_transactions WHERE category = 'subscription' "
        "GROUP BY 1, 2 HAVING count(*) > 1 ORDER BY 1, 2",
    )
    checker.equal(duplicate_charges, [("sub03", date(2026, 8, 1))], "duplicate charges")
    checker.finish()


def check_answer_key(cursor, checker: Checker) -> None:
    checker.start("answer key")
    try:
        key = json.loads(ANSWER_KEY_PATH.read_text(encoding="utf-8"))
    except Exception as exc:
        checker.check(False, f"cannot read answer key: {exc}")
        checker.finish()
        return

    checker.equal(len(key), 6, "answer key entry count")
    by_type = {}
    for entry in key:
        checker.check(isinstance(entry, dict), "answer key entry is not an object")
        if not isinstance(entry, dict):
            continue
        entry_type = entry.get("type")
        checker.check(entry_type not in by_type, f"duplicate answer-key type: {entry_type}")
        by_type[entry_type] = entry
    checker.equal(set(by_type), set(EXPECTED_ANSWER_KEY), "answer key types")

    total = Decimal("0.00")
    for entry_type, (client_id, subscription_id, expected_impact) in EXPECTED_ANSWER_KEY.items():
        entry = by_type.get(entry_type)
        checker.check(entry is not None, f"{entry_type}: missing entry")
        if entry is None:
            continue
        checker.equal(entry.get("client_id"), client_id, f"{entry_type}: client_id")
        checker.equal(entry.get("subscription_id"), subscription_id, f"{entry_type}: subscription_id")
        value = entry.get("monthly_impact_eur")
        checker.check(
            isinstance(value, (int, float)) and not isinstance(value, bool),
            f"{entry_type}: monthly_impact_eur is not numeric",
        )
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            actual = Decimal(str(value))
            checker.equal(actual, expected_impact, f"{entry_type}: monthly impact")
            total += actual
        note = entry.get("note")
        checker.check(isinstance(note, str) and bool(note.strip()), f"{entry_type}: empty note")
    checker.equal(total, Decimal("1918.00"), "answer key impact total")

    unbilled_hours = fetch_one(
        cursor,
        "SELECT coalesce(sum(hours), 0) FROM time_logs "
        "WHERE client_id = 'c01' AND invoice_id IS NULL",
    )
    c01_rate = fetch_one(cursor, "SELECT hourly_rate FROM clients WHERE client_id = 'c01'")
    computed = {"unbilled_hours": unbilled_hours * c01_rate}

    adobe = fetch_all(
        cursor,
        "SELECT date, amount FROM bank_transactions "
        "WHERE subscription_id = 'sub02' AND category = 'subscription' "
        "ORDER BY date, txn_id",
    )
    if adobe:
        computed["price_rise"] = abs(adobe[-1][1]) - abs(adobe[0][1])
    else:
        checker.check(False, "price_rise: no Adobe charges")

    computed["unused_subscription"] = fetch_one(
        cursor, "SELECT monthly_cost FROM subscriptions WHERE subscription_id = 'sub05'"
    )
    c07 = fetch_all(
        cursor, "SELECT hourly_rate, market_rate FROM clients WHERE client_id = 'c07'"
    )
    if c07:
        computed["underpriced_service"] = (c07[0][1] - c07[0][0]) * Decimal("30")
    else:
        checker.check(False, "underpriced_service: missing Kestrel")
    computed["late_payer"] = Decimal("0.00")
    duplicate_impact = fetch_one(
        cursor,
        "SELECT abs(amount) FROM bank_transactions "
        "WHERE subscription_id = 'sub03' AND category = 'subscription' "
        "AND date = '2026-08-22'",
    )
    if duplicate_impact is not None:
        computed["duplicate_charge"] = duplicate_impact
    else:
        checker.check(False, "duplicate_charge: missing duplicate Figma charge")

    for entry_type, computed_impact in computed.items():
        entry = by_type.get(entry_type)
        if entry is None:
            continue
        value = entry.get("monthly_impact_eur")
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            checker.equal(Decimal(str(value)), computed_impact, f"{entry_type}: DB impact")

    late_cash = fetch_one(
        cursor,
        "SELECT coalesce(sum(amount), 0) FROM invoices "
        "WHERE client_id = 'c04' AND paid_date IS NULL",
    )
    checker.equal(late_cash, Decimal("4800.00"), "late-payer cash at risk")
    late_entry = by_type.get("late_payer")
    if late_entry and isinstance(late_entry.get("note"), str):
        note = late_entry["note"]
        checker.check("4,800" in note or "4800" in note, "late-payer note omits cash at risk")
    checker.finish()


def main() -> int:
    print("Ledger Lens sanity checks", flush=True)
    checker = Checker()
    try:
        connection = connect()
    except psycopg2.Error as exc:
        print(f"database error: {str(exc).strip()}", file=sys.stderr)
        return 1

    try:
        with connection.cursor() as cursor:
            counts = check_row_counts(cursor, checker)
            check_clients(cursor, checker)
            check_invoices(cursor, checker)
            check_time_logs(cursor, checker)
            check_subscriptions(cursor, checker)
            check_cash(cursor, checker)
            check_leak_thresholds(cursor, checker)
            check_answer_key(cursor, checker)
    except psycopg2.Error as exc:
        print(f"database error: {str(exc).strip()}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"sanity check failed: {exc}", file=sys.stderr)
        return 1
    finally:
        connection.close()

    if checker.failures:
        print(f"\n{len(checker.failures)} failure(s):")
        for failure in checker.failures:
            print(f" - {failure}")
        return 1

    print(
        f"rows: clients={counts['clients']}, subscriptions={counts['subscriptions']}, "
        f"invoices={counts['invoices']}, time_logs={counts['time_logs']}, "
        f"bank_transactions={counts['bank_transactions']}"
    )
    print(f"\nAll {checker.checks} checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
