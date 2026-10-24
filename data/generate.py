#!/usr/bin/env python3
"""Generate the deterministic Ledger Lens synthetic dataset.

Writes:
  data/out/clients.csv
  data/out/subscriptions.csv
  data/out/invoices.csv
  data/out/time_logs.csv
  data/out/bank_transactions.csv
  data/out/summary.json
  data/answer_key.json

The generator uses integer cents throughout. It never reads the clock, the
database, or environment variables, so two runs produce byte-identical files.
"""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "out"
ANSWER_KEY_PATH = ROOT / "data" / "answer_key.json"

SEED = 20261001
YEAR = 2026
MONTHS = (4, 5, 6, 7, 8, 9)
START_DATE = date(2026, 4, 1)
END_DATE = date(2026, 9, 30)
TODAY = date(2026, 10, 1)
OPENING_DATE = date(2026, 3, 31)
OPENING_CENTS = 480_000
TARGET_CLOSING_CENTS = 842_000

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


@dataclass(frozen=True)
class Client:
    client_id: str
    name: str
    hourly_rate: int  # cents per hour
    market_rate: int  # cents per hour
    service: str
    payment_terms_days: int
    start_date: date
    active: bool = True


@dataclass(frozen=True)
class Subscription:
    subscription_id: str
    vendor: str
    plan: str
    monthly_cost: int  # current price, cents
    billing_day: int
    start_date: date
    cancelled_date: date | None = None
    last_login_date: date | None = None


@dataclass(frozen=True)
class Invoice:
    invoice_id: str
    client_id: str
    issue_date: date
    due_date: date
    paid_date: date | None
    hours_billed: int
    amount: int  # cents
    status: str


@dataclass(frozen=True)
class TimeLog:
    log_id: str
    client_id: str
    log_date: date
    hours: int
    billable: bool
    invoice_id: str | None
    description: str


@dataclass(frozen=True)
class Transaction:
    txn_id: str
    txn_date: date
    amount: int  # signed cents
    counterparty: str
    category: str
    invoice_id: str | None
    subscription_id: str | None
    description: str


CLIENTS = (
    Client("c01", "Atlas Co", 6_000, 6_500, "branding", 30, date(2024, 2, 1)),
    Client("c02", "Meridian Health", 8_500, 8_500, "ui_design", 30, date(2024, 6, 15)),
    Client("c03", "Stone & Finch", 7_250, 7_500, "branding", 15, date(2025, 1, 10)),
    Client("c04", "Nordwind Studio", 6_000, 6_000, "illustration", 30, date(2024, 9, 1)),
    Client("c05", "Lumen Labs", 9_000, 9_500, "ui_design", 30, date(2025, 3, 1)),
    Client("c06", "Harbor & Co", 6_800, 7_000, "branding", 45, date(2023, 11, 15)),
    Client("c07", "Kestrel Books", 4_200, 6_000, "illustration", 45, date(2024, 4, 1)),
    Client("c08", "Vela Coffee", 6_500, 6_500, "branding", 15, date(2025, 6, 1)),
    Client("c09", "Orbit Fitness", 7_800, 8_000, "ui_design", 30, date(2025, 9, 1)),
)
CLIENT_BY_ID = {client.client_id: client for client in CLIENTS}

SUBSCRIPTIONS = (
    Subscription("sub01", "Google Workspace", "Business Standard", 1_200, 2, date(2024, 2, 1), None, date(2026, 9, 30)),
    Subscription("sub02", "Adobe", "Creative Cloud All Apps", 8_099, 5, date(2024, 3, 1), None, date(2026, 9, 29)),
    Subscription("sub03", "Figma", "Professional", 1_500, 20, date(2024, 5, 1), None, date(2026, 9, 28)),
    Subscription("sub04", "Dropbox", "Plus", 1_199, 10, date(2024, 7, 1), None, date(2026, 9, 20)),
    Subscription("sub05", "Webflow", "CMS", 2_900, 12, date(2024, 8, 1), None, date(2026, 6, 29)),
    Subscription("sub06", "Framer", "Pro", 2_000, 8, date(2025, 1, 1), None, date(2026, 9, 27)),
    Subscription("sub07", "Vercel", "Pro", 2_000, 15, date(2025, 2, 1), None, date(2026, 9, 25)),
    Subscription("sub08", "Notion", "Plus", 1_000, 18, date(2024, 10, 1), None, date(2026, 9, 15)),
    Subscription("sub09", "Loom", "Business", 1_250, 22, date(2025, 3, 1), None, date(2026, 8, 25)),
    Subscription("sub10", "Miro", "Starter", 800, 25, date(2025, 5, 1), None, date(2026, 8, 10)),
)
SUBSCRIPTION_BY_ID = {sub.subscription_id: sub for sub in SUBSCRIPTIONS}

# Monthly (hours logged, hours invoiced). Atlas has deliberately unbilled hours
# in August and September; every other month is fully invoiced.
NORMAL_HOURS = {
    "c01": 40,
    "c02": 15,
    "c03": 10,
    "c04": 30,
    "c05": 6,
    "c06": 8,
    "c07": 30,
    "c08": 5,
    "c09": 6,
}
PLAN: dict[str, dict[int, tuple[int, int]]] = {}
for _client in CLIENTS:
    PLAN[_client.client_id] = {
        month: (NORMAL_HOURS[_client.client_id], NORMAL_HOURS[_client.client_id])
        for month in MONTHS
    }
PLAN["c01"][8] = (52, 40)
PLAN["c01"][9] = (50, 40)
PLAN["c04"][6] = (40, 40)
PLAN["c04"][7] = (40, 40)

RESERVED_INVOICE_IDS = {
    ("c04", 6): "inv0031",
    ("c04", 7): "inv0038",
}

DESCRIPTIONS = {
    "branding": (
        "Brand audit and positioning notes",
        "Logo and wordmark refinement",
        "Visual identity explorations",
        "Brand guidelines draft",
        "Client review revisions and export",
    ),
    "ui_design": (
        "Wireframe and flow refinement",
        "UI component design",
        "Interactive prototype pass",
        "Design system updates",
        "Client feedback revisions and handoff",
    ),
    "illustration": (
        "Concept sketches and composition study",
        "Line work and colour pass",
        "Final artwork revisions",
        "Cover artwork and asset preparation",
        "Client review revisions",
    ),
}


def money(cents: int) -> str:
    """Format signed integer cents as a 2-decimal string."""
    sign = "-" if cents < 0 else ""
    absolute = abs(cents)
    return f"{sign}{absolute // 100}.{absolute % 100:02d}"


def hours_text(hours: int) -> str:
    """Format whole hours as a numeric 2-decimal string."""
    return f"{hours}.00"


def month_last_day(month: int) -> date:
    if month == 12:
        return date(YEAR, 12, 31)
    return date(YEAR, month + 1, 1) - timedelta(days=1)


def plan_for(client_id: str, month: int) -> tuple[int, int]:
    return PLAN[client_id][month]


def split_hours(total_hours: int) -> list[int]:
    """Split whole hours into the fewest balanced chunks of at most 8 hours."""
    if total_hours <= 0:
        return []
    count = (total_hours + 7) // 8
    base, remainder = divmod(total_hours, count)
    return [base + (1 if index < remainder else 0) for index in range(count)]


def weekdays_in_month(month: int, max_date: date | None = None) -> list[date]:
    first = date(YEAR, month, 1)
    last = month_last_day(month)
    if max_date is not None:
        last = min(last, max_date)
    days: list[date] = []
    current = first
    while current <= last:
        if current.weekday() < 5:
            days.append(current)
        current += timedelta(days=1)
    return days


def pick_evenly(days: list[date], count: int) -> list[date]:
    """Pick count distinct dates spread evenly across a non-empty day list."""
    if count <= 0:
        return []
    if count > len(days):
        raise ValueError(f"cannot pick {count} dates from {len(days)} weekdays")
    if count == 1:
        return [days[len(days) // 2]]
    indexes: list[int] = []
    for index in range(count):
        candidate = round(index * (len(days) - 1) / (count - 1))
        while candidate in indexes:
            candidate = (candidate + 1) % len(days)
        indexes.append(candidate)
    return [days[index] for index in indexes]


def invoice_issue_date(client_id: str, month: int) -> date:
    if client_id == "c04" and month == 6:
        return date(2026, 7, 16)
    if client_id == "c04" and month == 7:
        return date(2026, 7, 30)
    return month_last_day(month)


def invoice_paid_date(client_id: str, month: int, issue_date: date, due_date: date) -> date | None:
    # Nordwind's June and July invoices are the only unpaid invoices.
    if client_id == "c04" and month in (6, 7):
        return None
    # One healthy control pays 8 days late; another pays 20 days late.
    if client_id == "c03" and month == 8:
        return due_date + timedelta(days=8)
    if client_id == "c06" and month == 5:
        return due_date + timedelta(days=20)
    return issue_date


def invoice_status(issue_date: date, due_date: date, paid_date: date | None) -> str:
    if paid_date is not None:
        return "paid"
    return "overdue" if due_date < TODAY else "sent"


def active_until(month: int, cancelled_date: date | None) -> bool:
    return cancelled_date is None or cancelled_date >= date(YEAR, month, 1)


def build_invoices() -> list[Invoice]:
    ids_by_key = dict(RESERVED_INVOICE_IDS)
    reserved_numbers = {31, 38}
    next_number = 1
    for client in CLIENTS:
        for month in MONTHS:
            key = (client.client_id, month)
            if key in RESERVED_INVOICE_IDS:
                continue
            while next_number in reserved_numbers:
                next_number += 1
            ids_by_key[key] = f"inv{next_number:04d}"
            next_number += 1

    invoices: list[Invoice] = []
    for client in CLIENTS:
        for month in MONTHS:
            _, billed_hours = plan_for(client.client_id, month)
            issue_date = invoice_issue_date(client.client_id, month)
            due_date = issue_date + timedelta(days=client.payment_terms_days)
            paid_date = invoice_paid_date(client.client_id, month, issue_date, due_date)
            invoices.append(
                Invoice(
                    invoice_id=ids_by_key[(client.client_id, month)],
                    client_id=client.client_id,
                    issue_date=issue_date,
                    due_date=due_date,
                    paid_date=paid_date,
                    hours_billed=billed_hours,
                    amount=billed_hours * client.hourly_rate,
                    status=invoice_status(issue_date, due_date, paid_date),
                )
            )
    return sorted(invoices, key=lambda invoice: (invoice.issue_date, invoice.invoice_id))


def build_time_logs(invoices: list[Invoice]) -> list[TimeLog]:
    # Build the work-month lookup directly from the deterministic plan order.
    invoice_by_key: dict[tuple[str, int], Invoice] = {}
    for client in CLIENTS:
        for month in MONTHS:
            _, billed_hours = plan_for(client.client_id, month)
            invoice_by_key[(client.client_id, month)] = next(
                invoice
                for invoice in invoices
                if invoice.client_id == client.client_id
                and invoice.hours_billed == billed_hours
                and invoice.issue_date == invoice_issue_date(client.client_id, month)
            )

    draft_logs: list[TimeLog] = []
    for client in CLIENTS:
        for month in MONTHS:
            logged_hours, billed_hours = plan_for(client.client_id, month)
            invoice = invoice_by_key[(client.client_id, month)]
            max_date = month_last_day(month)
            if invoice.issue_date.year == YEAR and invoice.issue_date.month == month:
                max_date = min(max_date, invoice.issue_date)
            workdays = weekdays_in_month(month, max_date)

            chunks: list[tuple[int, str | None]] = [
                (hours, invoice.invoice_id) for hours in split_hours(billed_hours)
            ]
            chunks.extend(
                (hours, None) for hours in split_hours(logged_hours - billed_hours)
            )
            dates = pick_evenly(workdays, len(chunks))
            descriptions = DESCRIPTIONS[client.service]

            for index, ((hours, invoice_id), log_date) in enumerate(zip(chunks, dates)):
                draft_logs.append(
                    TimeLog(
                        log_id="",
                        client_id=client.client_id,
                        log_date=log_date,
                        hours=hours,
                        billable=True,
                        invoice_id=invoice_id,
                        description=descriptions[index % len(descriptions)],
                    )
                )

    draft_logs.sort(
        key=lambda log: (
            log.log_date,
            log.client_id,
            log.invoice_id or "",
            log.description,
            log.hours,
        )
    )
    return [
        TimeLog(
            log_id=f"tl{index:05d}",
            client_id=log.client_id,
            log_date=log.log_date,
            hours=log.hours,
            billable=log.billable,
            invoice_id=log.invoice_id,
            description=log.description,
        )
        for index, log in enumerate(draft_logs, start=1)
    ]


def subscription_charge_amount(subscription: Subscription, month: int) -> int:
    if subscription.subscription_id == "sub02":
        return 6_699 if month in (4, 5) else 8_099
    return subscription.monthly_cost


def add_transaction(
    rows: list[dict],
    txn_date: date,
    amount: int,
    counterparty: str,
    category: str,
    description: str,
    invoice_id: str | None = None,
    subscription_id: str | None = None,
) -> None:
    if category not in CATEGORIES:
        raise ValueError(f"unknown category {category}")
    if amount == 0:
        raise ValueError("bank transaction amount cannot be zero")
    rows.append(
        {
            "txn_date": txn_date,
            "amount": amount,
            "counterparty": counterparty,
            "category": category,
            "invoice_id": invoice_id,
            "subscription_id": subscription_id,
            "description": description,
        }
    )


def build_bank_transactions(invoices: list[Invoice]) -> tuple[list[Transaction], list[int], int]:
    rows: list[dict] = []

    add_transaction(
        rows,
        OPENING_DATE,
        OPENING_CENTS,
        "Opening balance",
        "other",
        "Opening balance brought forward",
    )

    for invoice in invoices:
        if invoice.paid_date is None:
            continue
        client = CLIENT_BY_ID[invoice.client_id]
        add_transaction(
            rows,
            invoice.paid_date,
            invoice.amount,
            client.name,
            "client_payment",
            f"Payment for {invoice.invoice_id}",
            invoice_id=invoice.invoice_id,
        )

    for subscription in SUBSCRIPTIONS:
        for month in MONTHS:
            if not active_until(month, subscription.cancelled_date):
                continue
            charge_date = date(YEAR, month, subscription.billing_day)
            amount = subscription_charge_amount(subscription, month)
            add_transaction(
                rows,
                charge_date,
                -amount,
                subscription.vendor,
                "subscription",
                f"{subscription.vendor} {subscription.plan} monthly subscription",
                subscription_id=subscription.subscription_id,
            )
            if subscription.subscription_id == "sub03" and month == 8:
                add_transaction(
                    rows,
                    date(2026, 8, 22),
                    -amount,
                    subscription.vendor,
                    "subscription",
                    f"{subscription.vendor} {subscription.plan} monthly subscription",
                    subscription_id=subscription.subscription_id,
                )

    travel = {
        4: [(18, 12_000, "ONCF", "ONCF train tickets")],
        5: [(22, 24_000, "Royal Air Maroc", "Royal Air Maroc flight")],
        6: [(12, 18_000, "CTM", "CTM bus tickets")],
        7: [(20, 30_000, "Royal Air Maroc", "Royal Air Maroc flight")],
        8: [(8, 15_000, "ONCF", "ONCF train tickets")],
        9: [(19, 21_000, "Hotel Mazagan", "Hotel Mazagan stay")],
    }
    software = {
        4: (12, 4_900, "Envato", "Envato Elements subscription"),
        5: (9, 9_900, "Adobe Fonts", "Adobe Fonts licence"),
        6: (17, 2_900, "Coolors", "Coolors annual plan"),
        7: (14, 14_900, "Shutterstock", "Stock photo pack"),
        8: (21, 3_900, "Icons8", "Icon pack"),
        9: (11, 23_500, "MyFonts", "Font licence"),
    }
    other_days = {4: 20, 5: 16, 6: 24, 7: 18, 8: 14, 9: 23}

    for month in MONTHS:
        add_transaction(rows, date(YEAR, month, 3), -85_000, "Casa Business Center", "rent", "Office rent")
        add_transaction(rows, date(YEAR, month, 15), -140_000, "DGI Morocco", "tax", "Monthly tax reserve")
        add_transaction(rows, date(YEAR, month, 7), -18_000, "AXA Assurance Maroc", "other", "Health insurance")
        add_transaction(rows, date(YEAR, month, 10), -12_000, "Brahim Conseil", "other", "Accounting services")
        add_transaction(
            rows,
            date(YEAR, month, other_days[month]),
            -10_000,
            "Casa Coworking",
            "other",
            "Coworking day passes",
        )
        for day, amount, counterparty, description in travel[month]:
            add_transaction(rows, date(YEAR, month, day), -amount, counterparty, "travel", description)
        day, amount, counterparty, description = software[month]
        add_transaction(rows, date(YEAR, month, day), -amount, counterparty, "software", description)
        add_transaction(
            rows,
            month_last_day(month),
            -600,
            "Attijariwafa Bank",
            "other",
            "Bank fees",
        )

    receipts = sum(row["amount"] for row in rows if row["category"] == "client_payment")
    non_draw_outflows = -sum(
        row["amount"] for row in rows if row["amount"] < 0 and row["category"] != "personal"
    )
    draw_total = OPENING_CENTS + receipts - non_draw_outflows - TARGET_CLOSING_CENTS
    if draw_total <= 0:
        raise ValueError("personal draw total must be positive")

    base_draw, remainder = divmod(draw_total, len(MONTHS))
    draw_amounts = [base_draw] * len(MONTHS)
    draw_amounts[-1] += remainder
    for month, amount in zip(MONTHS, draw_amounts):
        add_transaction(
            rows,
            month_last_day(month),
            -amount,
            "Sara El Amrani",
            "personal",
            "Owner draw",
        )

    rows.sort(
        key=lambda row: (
            row["txn_date"],
            row["category"],
            row["counterparty"],
            row["description"],
            row["amount"],
            row["invoice_id"] or "",
            row["subscription_id"] or "",
        )
    )
    transactions = [
        Transaction(
            txn_id=f"tx{index:05d}",
            txn_date=row["txn_date"],
            amount=row["amount"],
            counterparty=row["counterparty"],
            category=row["category"],
            invoice_id=row["invoice_id"],
            subscription_id=row["subscription_id"],
            description=row["description"],
        )
        for index, row in enumerate(rows, start=1)
    ]
    return transactions, draw_amounts, draw_total

def cash_metrics(transactions: list[Transaction]) -> dict:
    daily = defaultdict(int)
    for transaction in transactions:
        daily[transaction.txn_date] += transaction.amount

    running = 0
    minimum = None
    minimum_date = OPENING_DATE
    for day in sorted(daily):
        running += daily[day]
        if minimum is None or running < minimum:
            minimum = running
            minimum_date = day

    receipts = sum(
        transaction.amount
        for transaction in transactions
        if transaction.category == "client_payment"
    )
    expenses = -sum(transaction.amount for transaction in transactions if transaction.amount < 0)
    return {
        "minimum_balance_cents": minimum or 0,
        "minimum_balance_date": minimum_date,
        "closing_balance_cents": running,
        "cash_receipts_cents": receipts,
        "cash_expenses_cents": expenses,
    }


def validate(
    invoices: list[Invoice],
    logs: list[TimeLog],
    transactions: list[Transaction],
    draw_amounts: list[int],
    draw_total: int,
    metrics: dict,
) -> None:
    errors: list[str] = []

    def check(condition: bool, message: str) -> None:
        if not condition:
            errors.append(message)

    check(len(CLIENTS) == 9, "expected 9 clients")
    check(len(SUBSCRIPTIONS) == 10, "expected 10 subscriptions")
    check(len(invoices) == 54, f"expected 54 invoices, got {len(invoices)}")
    check(len({invoice.invoice_id for invoice in invoices}) == len(invoices), "duplicate invoice_id")
    check(len({log.log_id for log in logs}) == len(logs), "duplicate log_id")
    check(len({txn.txn_id for txn in transactions}) == len(transactions), "duplicate txn_id")
    check({"inv0031", "inv0038"}.issubset({invoice.invoice_id for invoice in invoices}), "missing Nordwind invoice IDs")

    invoice_by_id = {invoice.invoice_id: invoice for invoice in invoices}
    for invoice in invoices:
        client = CLIENT_BY_ID[invoice.client_id]
        check(invoice.amount == invoice.hours_billed * client.hourly_rate, f"{invoice.invoice_id}: amount mismatch")
        check(invoice.due_date == invoice.issue_date + timedelta(days=client.payment_terms_days), f"{invoice.invoice_id}: due date mismatch")
        check(invoice.status == invoice_status(invoice.issue_date, invoice.due_date, invoice.paid_date), f"{invoice.invoice_id}: status mismatch")
        check(invoice.paid_date is None or invoice.paid_date >= invoice.issue_date, f"{invoice.invoice_id}: paid before issue")
        check((invoice.status == "paid") == (invoice.paid_date is not None), f"{invoice.invoice_id}: status/paid_date mismatch")

    unpaid_invoices = [invoice for invoice in invoices if invoice.paid_date is None]
    check(
        {invoice.invoice_id for invoice in unpaid_invoices} == {"inv0031", "inv0038"},
        "unpaid invoices must be exactly inv0031 and inv0038",
    )
    for invoice in unpaid_invoices:
        check(invoice.status == "overdue", f"{invoice.invoice_id}: unpaid invoice should be overdue")
        check(invoice.amount == 240_000, f"{invoice.invoice_id}: Nordwind invoice should be EUR 2,400")
    check(
        (TODAY - invoice_by_id["inv0031"].due_date).days == 47,
        "inv0031 should be 47 days late",
    )
    check(
        (TODAY - invoice_by_id["inv0038"].due_date).days == 33,
        "inv0038 should be 33 days late",
    )

    payments_by_invoice: dict[str, list[Transaction]] = defaultdict(list)
    for transaction in transactions:
        if transaction.category == "client_payment":
            check(transaction.invoice_id is not None, "client payment without invoice_id")
            check(transaction.subscription_id is None, "client payment also has subscription_id")
            check(transaction.amount > 0, "client payment should be positive")
            if transaction.invoice_id is not None:
                payments_by_invoice[transaction.invoice_id].append(transaction)

    for invoice in invoices:
        payments = payments_by_invoice.get(invoice.invoice_id, [])
        if invoice.paid_date is None:
            check(not payments, f"{invoice.invoice_id}: unpaid invoice has a payment")
        else:
            check(len(payments) == 1, f"{invoice.invoice_id}: expected exactly one payment")
            if payments:
                check(payments[0].amount == invoice.amount, f"{invoice.invoice_id}: payment amount mismatch")
                check(payments[0].txn_date == invoice.paid_date, f"{invoice.invoice_id}: payment date mismatch")

    late_days = sorted(
        (invoice.paid_date - invoice.due_date).days
        for invoice in invoices
        if invoice.paid_date is not None and invoice.paid_date > invoice.due_date
    )
    check(late_days == [8, 20], f"expected one 8-day and one 20-day late payment, got {late_days}")

    work_month_by_invoice: dict[str, set[int]] = defaultdict(set)
    for log in logs:
        check(log.billable, f"{log.log_id}: all generated logs should be billable")
        check(START_DATE <= log.log_date <= END_DATE, f"{log.log_id}: log outside data window")
        check(0 < log.hours <= 24, f"{log.log_id}: invalid hours")
        if log.invoice_id is not None:
            check(log.invoice_id in invoice_by_id, f"{log.log_id}: unknown invoice")
            invoice = invoice_by_id[log.invoice_id]
            check(invoice.client_id == log.client_id, f"{log.log_id}: invoice belongs to another client")
            work_month_by_invoice[log.invoice_id].add(log.log_date.month)

    for invoice in invoices:
        work_months = work_month_by_invoice.get(invoice.invoice_id, set())
        check(len(work_months) == 1, f"{invoice.invoice_id}: logs must cover exactly one work month")
        if work_months:
            check(invoice.issue_date >= date(YEAR, next(iter(work_months)), 1), f"{invoice.invoice_id}: issued before work month")

    expected_hours_by_month = {4: 150, 5: 150, 6: 160, 7: 160, 8: 162, 9: 160}
    for month, expected in expected_hours_by_month.items():
        actual = sum(log.hours for log in logs if log.log_date.month == month)
        check(actual == expected, f"month {month}: expected {expected} logged hours, got {actual}")

    for client in CLIENTS:
        for month in MONTHS:
            logged_expected, billed_expected = plan_for(client.client_id, month)
            month_logs = [
                log for log in logs if log.client_id == client.client_id and log.log_date.month == month
            ]
            logged = sum(log.hours for log in month_logs)
            billed = sum(log.hours for log in month_logs if log.invoice_id is not None)
            check(logged == logged_expected, f"{client.client_id}/{month}: logged hours {logged} != {logged_expected}")
            check(billed == billed_expected, f"{client.client_id}/{month}: billed hours {billed} != {billed_expected}")

    unbilled_logs = [log for log in logs if log.invoice_id is None]
    check(sum(log.hours for log in unbilled_logs) == 22, "expected 22 unbilled hours")
    check({log.client_id for log in unbilled_logs} == {"c01"}, "only Atlas should have unbilled logs")
    for month, expected in ((8, 12), (9, 10)):
        actual = sum(log.hours for log in unbilled_logs if log.log_date.month == month)
        check(actual == expected, f"Atlas {month}: expected {expected} unbilled hours, got {actual}")

    expected_invoiced_by_month = {
        4: 933_700,
        5: 933_700,
        6: 993_700,
        7: 993_700,
        8: 933_700,
        9: 933_700,
    }
    if all(work_month_by_invoice.get(invoice.invoice_id) for invoice in invoices):
        invoiced_by_month = {month: 0 for month in MONTHS}
        for invoice in invoices:
            work_month = next(iter(work_month_by_invoice[invoice.invoice_id]))
            invoiced_by_month[work_month] += invoice.amount
        for month, expected in expected_invoiced_by_month.items():
            check(invoiced_by_month[month] == expected, f"month {month}: invoice revenue {invoiced_by_month[month]} != {expected}")
    check(sum(invoice.amount for invoice in invoices) == 5_722_200, "invoice revenue must be EUR 57,222")

    sub_charges: dict[tuple[str, int], list[int]] = defaultdict(list)
    for transaction in transactions:
        if transaction.category == "subscription":
            check(transaction.subscription_id is not None, "subscription charge without subscription_id")
            check(transaction.invoice_id is None, "subscription charge also has invoice_id")
            check(transaction.amount < 0, "subscription charge should be negative")
            if transaction.subscription_id is not None:
                sub_charges[(transaction.subscription_id, transaction.txn_date.month)].append(-transaction.amount)

    for subscription in SUBSCRIPTIONS:
        for month in MONTHS:
            expected_count = 2 if subscription.subscription_id == "sub03" and month == 8 else 1
            actual = len(sub_charges[(subscription.subscription_id, month)])
            check(actual == expected_count, f"{subscription.subscription_id}/{month}: expected {expected_count} charges, got {actual}")

    adobe_charges = sorted(
        amount for (sub_id, _), amounts in sub_charges.items() if sub_id == "sub02" for amount in amounts
    )
    check(adobe_charges == [6_699, 6_699, 8_099, 8_099, 8_099, 8_099], "Adobe price history mismatch")
    figma_total = sum(
        amount for (sub_id, _), amounts in sub_charges.items() if sub_id == "sub03" for amount in amounts
    )
    check(figma_total == 10_500, "Figma should total EUR 105")
    webflow_charges = [
        amount for (sub_id, _), amounts in sub_charges.items() if sub_id == "sub05" for amount in amounts
    ]
    check(webflow_charges == [2_900] * 6, "Webflow should be EUR 29 x 6")
    last_login = SUBSCRIPTION_BY_ID["sub05"].last_login_date
    check(last_login is not None and (TODAY - last_login).days == 94, "Webflow last login must be 94 days ago")

    check(CLIENT_BY_ID["c07"].hourly_rate == 4_200, "Kestrel rate mismatch")
    check(CLIENT_BY_ID["c07"].market_rate == 6_000, "Kestrel market rate mismatch")
    check((CLIENT_BY_ID["c07"].market_rate - CLIENT_BY_ID["c07"].hourly_rate) * 30 == 54_000, "Kestrel underpricing mismatch")

    opening = [transaction for transaction in transactions if transaction.txn_date == OPENING_DATE]
    check(len(opening) == 1, "expected exactly one opening-balance transaction")
    if opening:
        check(opening[0].amount == OPENING_CENTS, "opening balance mismatch")
        check(opening[0].category == "other", "opening balance category mismatch")

    for transaction in transactions:
        check(transaction.category in CATEGORIES, f"{transaction.txn_id}: invalid category")
        check(transaction.counterparty != "", f"{transaction.txn_id}: empty counterparty")
        check(transaction.description != "", f"{transaction.txn_id}: empty description")
        check(
            transaction.txn_date == OPENING_DATE or START_DATE <= transaction.txn_date <= END_DATE,
            f"{transaction.txn_id}: date outside data window",
        )
        if transaction.category == "client_payment":
            check(transaction.invoice_id is not None, f"{transaction.txn_id}: client payment missing invoice")
        elif transaction.category == "subscription":
            check(transaction.subscription_id is not None, f"{transaction.txn_id}: subscription charge missing subscription")
        else:
            check(transaction.invoice_id is None, f"{transaction.txn_id}: unexpected invoice link")
            check(transaction.subscription_id is None, f"{transaction.txn_id}: unexpected subscription link")

    positives = [transaction for transaction in transactions if transaction.amount > 0]
    check(
        all(
            transaction.category == "client_payment" or transaction.txn_date == OPENING_DATE
            for transaction in positives
        ),
        "client payments and opening balance must be the only inflows",
    )

    check(sum(draw_amounts) == draw_total, "personal draw total mismatch")
    check(metrics["cash_receipts_cents"] == 5_242_200, "cash receipts must be EUR 52,422")
    check(metrics["cash_expenses_cents"] == 4_880_200, "cash expenses must be EUR 48,802")
    check(metrics["closing_balance_cents"] == TARGET_CLOSING_CENTS, "closing balance must be EUR 8,420")
    check(metrics["minimum_balance_cents"] >= 0, "running balance went negative")
    check(metrics["minimum_balance_date"] >= OPENING_DATE, "minimum balance date is before opening")

    if errors:
        raise AssertionError("dataset validation failed:\n- " + "\n- ".join(errors))


def answer_key_entries() -> list[dict]:
    return [
        {
            "type": "unbilled_hours",
            "client_id": "c01",
            "subscription_id": None,
            "monthly_impact_cents": 132_000,
            "note": "22h (12 Aug + 10 Sep) x EUR 60; Atlas Co",
        },
        {
            "type": "price_rise",
            "client_id": None,
            "subscription_id": "sub02",
            "monthly_impact_cents": 1_400,
            "note": "Adobe EUR 66.99 -> EUR 80.99 (+20.9%)",
        },
        {
            "type": "unused_subscription",
            "client_id": None,
            "subscription_id": "sub05",
            "monthly_impact_cents": 2_900,
            "note": "Webflow last login 2026-06-29 (94 days)",
        },
        {
            "type": "late_payer",
            "client_id": "c04",
            "subscription_id": None,
            "monthly_impact_cents": 0,
            "note": "inv0031 EUR 2,400 47d late; inv0038 EUR 2,400 33d late; EUR 4,800 cash at risk",
        },
        {
            "type": "underpriced_service",
            "client_id": "c07",
            "subscription_id": None,
            "monthly_impact_cents": 54_000,
            "note": "Kestrel EUR 42 vs EUR 60 market; 30h/month",
        },
        {
            "type": "duplicate_charge",
            "client_id": None,
            "subscription_id": "sub03",
            "monthly_impact_cents": 1_500,
            "note": "Figma twice in August",
        },
    ]


def write_csv(path: Path, fieldnames: list[str], rows: Iterable[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def write_answer_key() -> None:
    entries = answer_key_entries()
    lines = ["["]
    for index, entry in enumerate(entries):
        client_id = "null" if entry["client_id"] is None else json.dumps(entry["client_id"])
        subscription_id = (
            "null" if entry["subscription_id"] is None else json.dumps(entry["subscription_id"])
        )
        lines.extend(
            [
                "  {",
                f'    "type": {json.dumps(entry["type"])},',
                f'    "client_id": {client_id},',
                f'    "subscription_id": {subscription_id},',
                f'    "monthly_impact_eur": {money(entry["monthly_impact_cents"])},',
                f'    "note": {json.dumps(entry["note"], ensure_ascii=False)}',
                "  }" + ("," if index < len(entries) - 1 else ""),
            ]
        )
    lines.append("]")
    ANSWER_KEY_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_summary(
    invoices: list[Invoice],
    logs: list[TimeLog],
    transactions: list[Transaction],
    draw_amounts: list[int],
    metrics: dict,
) -> dict:
    work_month_by_invoice: dict[str, int] = {}
    for log in logs:
        if log.invoice_id is not None:
            work_month_by_invoice[log.invoice_id] = log.log_date.month

    invoiced_by_month = {month: 0 for month in MONTHS}
    for invoice in invoices:
        invoiced_by_month[work_month_by_invoice[invoice.invoice_id]] += invoice.amount

    receipts_by_month = {month: 0 for month in MONTHS}
    for transaction in transactions:
        if transaction.category == "client_payment":
            receipts_by_month[transaction.txn_date.month] += transaction.amount

    unpaid = [invoice for invoice in invoices if invoice.paid_date is None]
    return {
        "seed": SEED,
        "data_window": {"start": START_DATE.isoformat(), "end": END_DATE.isoformat()},
        "demo_date": TODAY.isoformat(),
        "row_counts": {
            "clients": len(CLIENTS),
            "subscriptions": len(SUBSCRIPTIONS),
            "invoices": len(invoices),
            "time_logs": len(logs),
            "bank_transactions": len(transactions),
        },
        "total_billable_hours": sum(log.hours for log in logs),
        "hours_logged_by_month": {
            f"{YEAR}-{month:02d}": sum(log.hours for log in logs if log.log_date.month == month)
            for month in MONTHS
        },
        "invoice_revenue_eur": round(sum(invoice.amount for invoice in invoices) / 100, 2),
        "invoice_revenue_by_work_month_eur": {
            f"{YEAR}-{month:02d}": round(invoiced_by_month[month] / 100, 2) for month in MONTHS
        },
        "cash_receipts_eur": round(metrics["cash_receipts_cents"] / 100, 2),
        "cash_receipts_by_month_eur": {
            f"{YEAR}-{month:02d}": round(receipts_by_month[month] / 100, 2) for month in MONTHS
        },
        "cash_expenses_eur": round(metrics["cash_expenses_cents"] / 100, 2),
        "opening_balance_eur": round(OPENING_CENTS / 100, 2),
        "closing_balance_eur": round(metrics["closing_balance_cents"] / 100, 2),
        "minimum_daily_balance_eur": round(metrics["minimum_balance_cents"] / 100, 2),
        "minimum_daily_balance_date": metrics["minimum_balance_date"].isoformat(),
        "personal_draw_total_eur": round(sum(draw_amounts) / 100, 2),
        "personal_draws_eur": {
            f"{YEAR}-{month:02d}": round(amount / 100, 2)
            for month, amount in zip(MONTHS, draw_amounts)
        },
        "unpaid_invoices": [
            {
                "invoice_id": invoice.invoice_id,
                "client_id": invoice.client_id,
                "amount_eur": round(invoice.amount / 100, 2),
                "due_date": invoice.due_date.isoformat(),
                "days_late": (TODAY - invoice.due_date).days,
            }
            for invoice in unpaid
        ],
        "unpaid_total_eur": round(sum(invoice.amount for invoice in unpaid) / 100, 2),
        "answer_key_entries": len(answer_key_entries()),
        "leak_types": [entry["type"] for entry in answer_key_entries()],
    }


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    invoices = build_invoices()
    logs = build_time_logs(invoices)
    transactions, draw_amounts, draw_total = build_bank_transactions(invoices)
    metrics = cash_metrics(transactions)
    validate(invoices, logs, transactions, draw_amounts, draw_total, metrics)

    write_csv(
        OUT_DIR / "clients.csv",
        [
            "client_id",
            "name",
            "hourly_rate",
            "market_rate",
            "service",
            "payment_terms_days",
            "start_date",
            "active",
        ],
        (
            {
                "client_id": client.client_id,
                "name": client.name,
                "hourly_rate": money(client.hourly_rate),
                "market_rate": money(client.market_rate),
                "service": client.service,
                "payment_terms_days": str(client.payment_terms_days),
                "start_date": client.start_date.isoformat(),
                "active": "true" if client.active else "false",
            }
            for client in CLIENTS
        ),
    )
    write_csv(
        OUT_DIR / "subscriptions.csv",
        [
            "subscription_id",
            "vendor",
            "plan",
            "monthly_cost",
            "billing_day",
            "start_date",
            "cancelled_date",
            "last_login_date",
        ],
        (
            {
                "subscription_id": subscription.subscription_id,
                "vendor": subscription.vendor,
                "plan": subscription.plan,
                "monthly_cost": money(subscription.monthly_cost),
                "billing_day": str(subscription.billing_day),
                "start_date": subscription.start_date.isoformat(),
                "cancelled_date": subscription.cancelled_date.isoformat() if subscription.cancelled_date else "",
                "last_login_date": subscription.last_login_date.isoformat() if subscription.last_login_date else "",
            }
            for subscription in SUBSCRIPTIONS
        ),
    )
    write_csv(
        OUT_DIR / "invoices.csv",
        ["invoice_id", "client_id", "issue_date", "due_date", "paid_date", "hours_billed", "amount", "status"],
        (
            {
                "invoice_id": invoice.invoice_id,
                "client_id": invoice.client_id,
                "issue_date": invoice.issue_date.isoformat(),
                "due_date": invoice.due_date.isoformat(),
                "paid_date": invoice.paid_date.isoformat() if invoice.paid_date else "",
                "hours_billed": hours_text(invoice.hours_billed),
                "amount": money(invoice.amount),
                "status": invoice.status,
            }
            for invoice in invoices
        ),
    )
    write_csv(
        OUT_DIR / "time_logs.csv",
        ["log_id", "client_id", "date", "hours", "billable", "invoice_id", "description"],
        (
            {
                "log_id": log.log_id,
                "client_id": log.client_id,
                "date": log.log_date.isoformat(),
                "hours": hours_text(log.hours),
                "billable": "true" if log.billable else "false",
                "invoice_id": log.invoice_id or "",
                "description": log.description,
            }
            for log in logs
        ),
    )
    write_csv(
        OUT_DIR / "bank_transactions.csv",
        ["txn_id", "date", "amount", "counterparty", "category", "invoice_id", "subscription_id", "description"],
        (
            {
                "txn_id": transaction.txn_id,
                "date": transaction.txn_date.isoformat(),
                "amount": money(transaction.amount),
                "counterparty": transaction.counterparty,
                "category": transaction.category,
                "invoice_id": transaction.invoice_id or "",
                "subscription_id": transaction.subscription_id or "",
                "description": transaction.description,
            }
            for transaction in transactions
        ),
    )

    summary = build_summary(invoices, logs, transactions, draw_amounts, metrics)
    (OUT_DIR / "summary.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    write_answer_key()

    print(
        f"generated {summary['row_counts']['clients']} clients, "
        f"{summary['row_counts']['subscriptions']} subscriptions, "
        f"{summary['row_counts']['invoices']} invoices, "
        f"{summary['row_counts']['time_logs']} time logs, "
        f"{summary['row_counts']['bank_transactions']} bank transactions"
    )
    print(
        f"invoice revenue EUR {summary['invoice_revenue_eur']:.2f}; "
        f"cash receipts EUR {summary['cash_receipts_eur']:.2f}; "
        f"cash expenses EUR {summary['cash_expenses_eur']:.2f}; "
        f"closing EUR {summary['closing_balance_eur']:.2f}"
    )
    print(
        f"minimum daily balance EUR {summary['minimum_daily_balance_eur']:.2f} "
        f"on {summary['minimum_daily_balance_date']}; "
        f"unpaid EUR {summary['unpaid_total_eur']:.2f}"
    )
    print(f"wrote {OUT_DIR} and {ANSWER_KEY_PATH}")


if __name__ == "__main__":
    main()
