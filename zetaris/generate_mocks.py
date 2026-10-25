#!/usr/bin/env python3
"""Build backend/src/zetaris/mock/*.json from the deterministic dataset.

This is the offline stand-in for the four Zetaris views. It reads the CSVs
produced by `python data/generate.py` and applies the same rules as
zetaris/views/*.sql, so the backend can run with ZETARIS_MOCK=1 before (or
without) a live Zetaris instance.

Usage:
    python data/generate.py
    python zetaris/generate_mocks.py

The generated files are committed; data/out is not.
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "out"
MOCK_DIR = ROOT / "backend" / "src" / "zetaris" / "mock"

TODAY = date(2026, 10, 1)
WINDOW_START = date(2026, 4, 1)
WINDOW_END = date(2026, 9, 30)
MONTHS = [date(2026, month, 1) for month in range(4, 10)]
# currency-api snapshot for the demo date; MAD is display-only in Ledger Lens.
FX_EUR_MAD = Decimal("10.99916935")


def cents(value: str) -> Decimal:
    return Decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def number(value: Decimal, places: str = "0.01") -> float:
    return float(value.quantize(Decimal(places), rounding=ROUND_HALF_UP))


def month_start(value: date) -> date:
    return date(value.year, value.month, 1)


def load_rows(table: str, data_dir: Path) -> list[dict[str, str]]:
    path = data_dir / f"{table}.csv"
    if not path.exists():
        raise SystemExit(f"missing {path}; run `python data/generate.py` first")
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def load_dataset(data_dir: Path) -> dict[str, list[dict]]:
    clients = [
        {
            **row,
            "hourly_rate": cents(row["hourly_rate"]),
            "market_rate": cents(row["market_rate"]),
            "payment_terms_days": int(row["payment_terms_days"]),
            "start_date": date.fromisoformat(row["start_date"]),
            "active": row["active"] == "true",
        }
        for row in load_rows("clients", data_dir)
    ]
    subscriptions = [
        {
            **row,
            "monthly_cost": cents(row["monthly_cost"]),
            "billing_day": int(row["billing_day"]),
            "start_date": date.fromisoformat(row["start_date"]),
            "cancelled_date": date.fromisoformat(row["cancelled_date"])
            if row["cancelled_date"]
            else None,
            "last_login_date": date.fromisoformat(row["last_login_date"])
            if row["last_login_date"]
            else None,
        }
        for row in load_rows("subscriptions", data_dir)
    ]
    invoices = [
        {
            **row,
            "issue_date": date.fromisoformat(row["issue_date"]),
            "due_date": date.fromisoformat(row["due_date"]),
            "paid_date": date.fromisoformat(row["paid_date"]) if row["paid_date"] else None,
            "hours_billed": Decimal(row["hours_billed"]),
            "amount": cents(row["amount"]),
        }
        for row in load_rows("invoices", data_dir)
    ]
    time_logs = [
        {
            **row,
            "date": date.fromisoformat(row["date"]),
            "hours": Decimal(row["hours"]),
            "billable": row["billable"] == "true",
            "invoice_id": row["invoice_id"] or None,
        }
        for row in load_rows("time_logs", data_dir)
    ]
    transactions = [
        {
            **row,
            "date": date.fromisoformat(row["date"]),
            "amount": cents(row["amount"]),
            "invoice_id": row["invoice_id"] or None,
            "subscription_id": row["subscription_id"] or None,
        }
        for row in load_rows("bank_transactions", data_dir)
    ]
    return {
        "clients": clients,
        "subscriptions": subscriptions,
        "invoices": invoices,
        "time_logs": time_logs,
        "bank_transactions": transactions,
    }


def build_client_profitability(data: dict[str, list[dict]]) -> list[dict]:
    logged: dict[tuple[str, date], dict[str, Decimal]] = defaultdict(
        lambda: {"hours_logged": Decimal(0), "hours_billed": Decimal(0)}
    )
    for log in data["time_logs"]:
        if not log["billable"]:
            continue
        key = (log["client_id"], month_start(log["date"]))
        logged[key]["hours_logged"] += log["hours"]
        if log["invoice_id"]:
            logged[key]["hours_billed"] += log["hours"]

    # Revenue is attributed to the month of the time logs the invoice covers.
    work_month: dict[str, date] = {}
    for log in data["time_logs"]:
        if not log["invoice_id"]:
            continue
        current = work_month.get(log["invoice_id"])
        if current is None or log["date"] < current:
            work_month[log["invoice_id"]] = log["date"]
    invoiced: dict[tuple[str, date], Decimal] = defaultdict(Decimal)
    for invoice in data["invoices"]:
        work_date = work_month.get(invoice["invoice_id"])
        if work_date is None:
            continue
        invoiced[(invoice["client_id"], month_start(work_date))] += invoice["amount"]

    received: dict[tuple[str, date], Decimal] = defaultdict(Decimal)
    for invoice in data["invoices"]:
        if invoice["paid_date"] is None:
            continue
        received[(invoice["client_id"], month_start(invoice["paid_date"]))] += invoice["amount"]

    rows: list[dict] = []
    for client in data["clients"]:
        for month in MONTHS:
            key = (client["client_id"], month)
            hours_logged = logged[key]["hours_logged"]
            hours_billed = logged[key]["hours_billed"]
            unbilled = hours_logged - hours_billed
            revenue_invoiced = invoiced.get(key, Decimal(0))
            rows.append(
                {
                    "client_id": client["client_id"],
                    "client_name": client["name"],
                    "month": month.isoformat(),
                    "hours_logged": number(hours_logged),
                    "hours_billed": number(hours_billed),
                    "unbilled_hours": number(unbilled),
                    "unbilled_pct": number(unbilled * 100 / hours_logged)
                    if hours_logged
                    else 0.0,
                    "hourly_rate": number(client["hourly_rate"]),
                    "market_rate": number(client["market_rate"]),
                    "effective_rate": number(revenue_invoiced / hours_logged)
                    if hours_logged
                    else 0.0,
                    "revenue_invoiced": number(revenue_invoiced),
                    "revenue_received": number(received.get(key, Decimal(0))),
                }
            )
    rows.sort(key=lambda row: (row["client_id"], row["month"]))
    return rows


def build_cash_position(data: dict[str, list[dict]]) -> list[dict]:
    opening = sum(
        (txn["amount"] for txn in data["bank_transactions"] if txn["date"] < WINDOW_START),
        Decimal(0),
    )
    daily: dict[date, dict[str, Decimal]] = defaultdict(
        lambda: {"inflow": Decimal(0), "outflow": Decimal(0), "net": Decimal(0)}
    )
    for txn in data["bank_transactions"]:
        if not (WINDOW_START <= txn["date"] <= WINDOW_END):
            continue
        day = daily[txn["date"]]
        if txn["amount"] > 0:
            day["inflow"] += txn["amount"]
        elif txn["amount"] < 0:
            day["outflow"] += -txn["amount"]
        day["net"] += txn["amount"]

    rows: list[dict] = []
    balance = opening
    day = WINDOW_START
    while day <= WINDOW_END:
        values = daily.get(day, {"inflow": Decimal(0), "outflow": Decimal(0), "net": Decimal(0)})
        balance += values["net"]
        rows.append(
            {
                "date": day.isoformat(),
                "inflow": number(values["inflow"]),
                "outflow": number(values["outflow"]),
                "net": number(values["net"]),
                "balance": number(balance),
            }
        )
        day += timedelta(days=1)
    return rows


def build_subscription_usage(data: dict[str, list[dict]]) -> list[dict]:
    charges: dict[str, list[tuple[date, Decimal]]] = defaultdict(list)
    for txn in data["bank_transactions"]:
        if txn["category"] != "subscription" or not txn["subscription_id"]:
            continue
        charges[txn["subscription_id"]].append((txn["date"], -txn["amount"]))

    rows: list[dict] = []
    for subscription in data["subscriptions"]:
        history = sorted(charges.get(subscription["subscription_id"], []), key=lambda item: item[0])
        first = history[0][1] if history else subscription["monthly_cost"]
        last = history[-1][1] if history else subscription["monthly_cost"]
        monthly_counts: dict[date, int] = defaultdict(int)
        for charge_date, _ in history:
            monthly_counts[month_start(charge_date)] += 1
        login = subscription["last_login_date"]
        rows.append(
            {
                "subscription_id": subscription["subscription_id"],
                "vendor": subscription["vendor"],
                "plan": subscription["plan"],
                "monthly_cost": number(subscription["monthly_cost"]),
                "first_charge_amount": number(first),
                "last_charge_amount": number(last),
                "price_change_pct": number((last - first) * 100 / first) if first else 0.0,
                "last_login_date": login.isoformat() if login else None,
                "days_since_login": (TODAY - login).days if login else None,
                "max_charges_in_a_month": max(monthly_counts.values(), default=0),
                "total_charged": number(sum((amount for _, amount in history), Decimal(0))),
            }
        )
    rows.sort(key=lambda row: row["subscription_id"])
    return rows


def build_ar_aging(data: dict[str, list[dict]]) -> list[dict]:
    client_names = {client["client_id"]: client["name"] for client in data["clients"]}
    rows: list[dict] = []
    for invoice in data["invoices"]:
        days_late = max(
            0,
            ((invoice["paid_date"] or TODAY) - invoice["due_date"]).days,
        )
        if days_late == 0:
            bucket = "on_time"
        elif days_late <= 30:
            bucket = "1-30"
        elif days_late <= 60:
            bucket = "31-60"
        elif days_late <= 90:
            bucket = "61-90"
        else:
            bucket = "90+"
        rows.append(
            {
                "invoice_id": invoice["invoice_id"],
                "client_id": invoice["client_id"],
                "client_name": client_names[invoice["client_id"]],
                "amount": number(invoice["amount"]),
                "issue_date": invoice["issue_date"].isoformat(),
                "due_date": invoice["due_date"].isoformat(),
                "paid_date": invoice["paid_date"].isoformat() if invoice["paid_date"] else None,
                "days_late": days_late,
                "bucket": bucket,
                "status": invoice["status"],
            }
        )
    rows.sort(key=lambda row: (row["issue_date"], row["invoice_id"]))
    return rows


def build_fx_rates() -> list[dict]:
    rows: list[dict] = []
    day = date(2026, 3, 31)
    while day <= TODAY:
        rows.append(
            {
                "date": day.isoformat(),
                "base": "EUR",
                "quote": "MAD",
                "rate": float(FX_EUR_MAD),
            }
        )
        day += timedelta(days=1)
    return rows


def assert_expected(
    client_profitability: list[dict],
    cash_position: list[dict],
    subscription_usage: list[dict],
    ar_aging: list[dict],
) -> None:
    def find_client(client_id: str, month: str) -> dict:
        return next(
            row
            for row in client_profitability
            if row["client_id"] == client_id and row["month"] == month
        )

    def find_sub(subscription_id: str) -> dict:
        return next(row for row in subscription_usage if row["subscription_id"] == subscription_id)

    def find_invoice(invoice_id: str) -> dict:
        return next(row for row in ar_aging if row["invoice_id"] == invoice_id)

    c01_aug = find_client("c01", "2026-08-01")
    assert c01_aug["hours_logged"] == 52
    assert c01_aug["hours_billed"] == 40
    assert c01_aug["unbilled_hours"] == 12
    assert c01_aug["unbilled_pct"] == 23.08
    assert c01_aug["revenue_invoiced"] == 2400.0

    c01_sep = find_client("c01", "2026-09-01")
    assert (c01_sep["hours_logged"], c01_sep["hours_billed"]) == (50, 40)
    assert c01_sep["unbilled_hours"] == 10
    assert c01_sep["unbilled_pct"] == 20.0

    c07_sep = find_client("c07", "2026-09-01")
    assert (c07_sep["hourly_rate"], c07_sep["market_rate"]) == (42.0, 60.0)
    assert c07_sep["revenue_invoiced"] == 1260.0

    assert find_client("c04", "2026-06-01")["revenue_received"] == 0.0
    assert find_client("c04", "2026-07-01")["revenue_received"] == 0.0
    assert find_client("c04", "2026-08-01")["revenue_received"] == 1800.0

    adobe = find_sub("sub02")
    assert (adobe["first_charge_amount"], adobe["last_charge_amount"]) == (66.99, 80.99)
    assert adobe["price_change_pct"] == 20.9
    assert find_sub("sub05")["days_since_login"] == 94
    figma = find_sub("sub03")
    assert figma["max_charges_in_a_month"] == 2
    assert figma["total_charged"] == 105.0

    assert find_invoice("inv0031")["days_late"] == 47
    assert find_invoice("inv0031")["bucket"] == "31-60"
    assert find_invoice("inv0038")["days_late"] == 33

    assert cash_position[-1]["date"] == "2026-09-30"
    assert cash_position[-1]["balance"] == 8420.0
    assert len(client_profitability) == 54
    assert len(cash_position) == 183
    assert len(subscription_usage) == 10
    assert len(ar_aging) == 54
    assert round(sum(row["revenue_invoiced"] for row in client_profitability), 2) == 57222.0
    assert round(sum(row["revenue_received"] for row in client_profitability), 2) == 52422.0
    assert round(sum(row["outflow"] for row in cash_position), 2) == 48802.0


def assert_basic(
    client_profitability: list[dict],
    cash_position: list[dict],
    subscription_usage: list[dict],
    ar_aging: list[dict],
) -> None:
    """Generic invariants for a persona whose exact expectations live in its answer key."""
    assert client_profitability, "client_profitability is empty"
    assert subscription_usage, "subscription_usage is empty"
    assert ar_aging, "ar_aging is empty"
    assert cash_position, "cash_position is empty"
    assert cash_position[-1]["date"] == WINDOW_END.isoformat()
    for row in client_profitability:
        assert row["client_id"], row
        assert row["month"], row
        assert float(row["hours_logged"]) >= 0
        assert float(row["hours_billed"]) >= 0
    for row in subscription_usage:
        assert row["subscription_id"], row
    for row in ar_aging:
        assert row["invoice_id"], row
        assert row["bucket"] in {"on_time", "1-30", "31-60", "61-90", "90+"}


def write_json(name: str, rows: list[dict], mock_dir: Path) -> None:
    mock_dir.mkdir(parents=True, exist_ok=True)
    path = mock_dir / f"{name}.json"
    path.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    try:
        shown = path.relative_to(ROOT)
    except ValueError:
        shown = path
    print(f"wrote {shown} ({len(rows)} rows)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--persona",
        choices=("a", "b"),
        default="a",
        help="a = demo dataset in data/out; b = generalization dataset in data/out/b",
    )
    parser.add_argument("--input-dir", type=Path, help="override the CSV directory")
    parser.add_argument("--output-dir", type=Path, help="override the mock JSON directory")
    args = parser.parse_args()

    data_dir = args.input_dir or (DATA_DIR / "b" if args.persona == "b" else DATA_DIR)
    mock_dir = args.output_dir or (MOCK_DIR / "b" if args.persona == "b" else MOCK_DIR)

    data = load_dataset(data_dir)
    client_profitability = build_client_profitability(data)
    cash_position = build_cash_position(data)
    subscription_usage = build_subscription_usage(data)
    ar_aging = build_ar_aging(data)
    fx_rates = build_fx_rates()

    if args.persona == "a":
        assert_expected(client_profitability, cash_position, subscription_usage, ar_aging)
    else:
        assert_basic(client_profitability, cash_position, subscription_usage, ar_aging)

    print(f"Mock views for persona {args.persona.upper()} from {data_dir}")
    write_json("client_profitability", client_profitability, mock_dir)
    write_json("cash_position", cash_position, mock_dir)
    write_json("subscription_usage", subscription_usage, mock_dir)
    write_json("ar_aging", ar_aging, mock_dir)
    write_json("fx_rates", fx_rates, mock_dir)


if __name__ == "__main__":
    main()
