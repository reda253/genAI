#!/usr/bin/env python3
"""One-command Zetaris setup for Ledger Lens (P2).

What it does, in order:
  1. registers the synthetic Postgres datasource and imports its five tables;
  2. creates the SchemaStore container and the four contract views;
  3. registers the public EUR/MAD REST source and the display-only fx_rates view;
  4. verifies the numbers against data/README.md §8 and prints PASS/FAIL.

Usage:
    ./zetaris/setup_zetaris.sh              # register + create + verify
    ./zetaris/setup_zetaris.sh --dry-run    # show statements, no network calls
    ./zetaris/setup_zetaris.sh --verify-only
    ./zetaris/setup_zetaris.sh --skip-verify

Configuration comes from the repo-root .env (see .env.example). Nothing is
written to disk: the SQL is rendered in memory so the Postgres password never
lands in a generated file.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"
DEFAULT_FX_ENDPOINT = (
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-10-01"
    "/v1/currencies/eur.json"
)

ALREADY_EXISTS = re.compile(r"already (exists|registered)", re.IGNORECASE)


class SetupError(RuntimeError):
    pass


def load_env(path: Path = ENV_FILE) -> None:
    """Load KEY=VALUE lines without overriding the caller's environment."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        os.environ.setdefault(key.strip(), value)


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def detect_pg_host() -> str:
    """The Postgres host as seen from inside the Zetaris containers."""
    explicit = env("ZETARIS_PG_HOST")
    if explicit:
        return explicit

    if platform.system() != "Linux":
        return "host.docker.internal"

    # On Linux, Docker Desktop's host name usually does not resolve. The host's
    # docker0 bridge address is reachable from containers and avoids localhost.
    try:
        output = subprocess.check_output(
            ["ip", "-4", "-o", "addr", "show", "docker0"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
        match = re.search(r"inet\s+(\d+\.\d+\.\d+\.\d+)", output)
        if match:
            return match.group(1)
    except (OSError, subprocess.CalledProcessError):
        pass

    # A custom Docker bridge is still a host address containers can reach.
    try:
        output = subprocess.check_output(
            ["ip", "-4", "-o", "addr", "show"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
        for line in output.splitlines():
            if "br-" in line:
                match = re.search(r"inet\s+(\d+\.\d+\.\d+\.\d+)", line)
                if match:
                    return match.group(1)
    except (OSError, subprocess.CalledProcessError):
        pass

    return "host.docker.internal"


def require_quote_safe(name: str, value: str) -> None:
    if '"' in value or "\n" in value or "\r" in value:
        raise SetupError(
            f"{name} contains a double quote or newline; choose a value without them "
            "for the Zetaris datasource option string"
        )


def substitutions(container: str, pg_datasource: str) -> dict[str, str]:
    password = env("POSTGRES_PASSWORD", "ledger_dev")
    values = {
        "__PG_DATASOURCE__": pg_datasource,
        "__PG_HOST__": detect_pg_host(),
        "__PG_PORT__": env("POSTGRES_PORT", "5433"),
        "__PG_DATABASE__": env("POSTGRES_DB", "ledger_lens"),
        "__PG_USER__": env("POSTGRES_USER", "ledger"),
        "__PG_PASSWORD__": password,
        "__VIEW_CONTAINER__": container,
        "__FX_ENDPOINT__": env("ZETARIS_FX_ENDPOINT", DEFAULT_FX_ENDPOINT),
    }
    for name in ("__PG_HOST__", "__PG_PORT__", "__PG_DATABASE__", "__PG_USER__", "__PG_PASSWORD__"):
        require_quote_safe(name, values[name])
    return values


def split_statements(text: str) -> list[str]:
    """Split on semicolons outside quotes; drop comments."""
    statements: list[str] = []
    buffer: list[str] = []
    quote: str | None = None
    index = 0
    while index < len(text):
        char = text[index]
        if quote:
            buffer.append(char)
            if char == quote:
                if index + 1 < len(text) and text[index + 1] == quote:
                    buffer.append(text[index + 1])
                    index += 1
                else:
                    quote = None
        elif char in "'\"`":
            quote = char
            buffer.append(char)
        elif text.startswith("--", index):
            while index < len(text) and text[index] != "\n":
                index += 1
            continue
        elif text.startswith("/*", index):
            end = text.find("*/", index + 2)
            index = len(text) if end == -1 else end + 2
            continue
        elif char == ";":
            statement = "".join(buffer).strip()
            if statement:
                statements.append(statement)
            buffer = []
        else:
            buffer.append(char)
        index += 1
    statement = "".join(buffer).strip()
    if statement:
        statements.append(statement)
    return statements


def render_sql(path: Path, values: dict[str, str]) -> list[str]:
    text = path.read_text(encoding="utf-8")
    for placeholder, value in values.items():
        text = text.replace(placeholder, value)
    leftover = re.findall(r"__[A-Z_]+__", text)
    if leftover:
        raise SetupError(f"{path} still has placeholders: {', '.join(sorted(set(leftover)))}")
    return split_statements(text)


def setup_files(container: str) -> list[Path]:
    """Sources first, then the container, then views and the FX source."""
    view_files = sorted((ROOT / "zetaris" / "views").glob("*.sql"))
    return [
        ROOT / "zetaris" / "sources" / "postgres.sql",
        *view_files,
        ROOT / "zetaris" / "sources" / "fx_rates.sql",
    ]


@dataclass
class Result:
    headers: list[str]
    rows: list[list[Any]]


class ZetarisRunner:
    def __init__(self, base_url: str, api_key: str, org_id: str, timeout: int) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.org_id = org_id
        self.timeout = timeout

    def _call(self, path: str, body: dict[str, Any] | None = None) -> Any:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "X-Org-ID": self.org_id,
            "X-Request-ID": str(uuid.uuid4()),
        }
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")
        request = urllib.request.Request(
            self.base_url + path,
            data=data,
            headers=headers,
            method="POST" if body is not None else "GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read().decode("utf-8") or "null")
        except urllib.error.HTTPError as error:
            detail = error.read(1000).decode("utf-8", errors="replace")
            raise SetupError(f"HTTP {error.code}: {detail.strip()}") from error
        except (urllib.error.URLError, OSError, TimeoutError) as error:
            raise SetupError(
                f"cannot reach {self.base_url}: {getattr(error, 'reason', error)}"
            ) from error

    def run(self, sql: str) -> Result:
        payload = {
            "queryId": str(uuid.uuid4()),
            "sql": sql,
            "source": "SqlEditor",
            "limit": 1000,
        }
        response = self._call("/sql-editor/sqls/run", payload)
        if not isinstance(response, dict):
            raise SetupError(f"unexpected response: {response!r}")
        if response.get("error"):
            raise SetupError(str(response["error"]))
        headers = response.get("headers") or response.get("columns") or []
        data = response.get("data") or []
        return Result([str(header) for header in headers], data)

    def fetch_one(self, sql: str) -> dict[str, Any]:
        result = self.run(sql)
        if not result.rows:
            raise SetupError(f"query returned no rows: {sql}")
        return dict(zip(result.headers, result.rows[0]))


def print_statement(sql: str) -> None:
    compact = " ".join(sql.split())
    if len(compact) > 110:
        compact = compact[:107] + "..."
    print(f"  -> {compact}")


def run_setup(runner: ZetarisRunner, statements: list[tuple[Path, str]]) -> None:
    for path, sql in statements:
        print_statement(sql)
        try:
            runner.run(sql)
        except SetupError as error:
            if ALREADY_EXISTS.search(str(error)) and re.match(
                r"\s*CREATE\s+(SCHEMASTORE\s+CONTAINER|LIGHTNING\s+DATABASE|LIGHTNING\s+REST\s+TABLE|DATASOURCE)",
                sql,
                re.IGNORECASE,
            ):
                print(f"     already exists, keeping it ({path.name})")
                continue
            if ALREADY_EXISTS.search(str(error)) and re.match(
                r"\s*REGISTER\s+DATASOURCE\s+TABLES", sql, re.IGNORECASE
            ):
                print("     tables already registered, continuing")
                continue
            raise SetupError(f"{path.name}: {error}") from error


def numeric(value: Any) -> float:
    if value is None or value == "":
        raise SetupError("expected a number, got null")
    return float(value)


def verify(runner: ZetarisRunner, container: str) -> int:
    checks: list[tuple[str, str, dict[str, Any]]] = [
        (
            "client_profitability c01 Aug 2026",
            f"""SELECT hours_logged, hours_billed, unbilled_hours, unbilled_pct, revenue_invoiced
                FROM {container}.client_profitability
                WHERE client_id = 'c01' AND `month` = to_date('2026-08-01')""",
            {
                "hours_logged": 52,
                "hours_billed": 40,
                "unbilled_hours": 12,
                "unbilled_pct": 23.08,
                "revenue_invoiced": 2400,
            },
        ),
        (
            "client_profitability c01 Sep 2026",
            f"""SELECT hours_logged, hours_billed, unbilled_hours, unbilled_pct
                FROM {container}.client_profitability
                WHERE client_id = 'c01' AND `month` = to_date('2026-09-01')""",
            {
                "hours_logged": 50,
                "hours_billed": 40,
                "unbilled_hours": 10,
                "unbilled_pct": 20.0,
            },
        ),
        (
            "client_profitability c07 Sep 2026",
            f"""SELECT hours_logged, hours_billed, hourly_rate, market_rate, revenue_invoiced
                FROM {container}.client_profitability
                WHERE client_id = 'c07' AND `month` = to_date('2026-09-01')""",
            {
                "hours_logged": 30,
                "hours_billed": 30,
                "hourly_rate": 42,
                "market_rate": 60,
                "revenue_invoiced": 1260,
            },
        ),
        (
            "client_profitability c04 revenue received",
            f"""SELECT `month`, revenue_invoiced, revenue_received
                FROM {container}.client_profitability
                WHERE client_id = 'c04' AND `month` IN (
                    to_date('2026-06-01'), to_date('2026-07-01'), to_date('2026-08-01')
                )
                ORDER BY `month`""",
            {},
        ),
        (
            "subscription_usage Adobe",
            f"""SELECT monthly_cost, first_charge_amount, last_charge_amount, price_change_pct
                FROM {container}.subscription_usage WHERE subscription_id = 'sub02'""",
            {
                "monthly_cost": 80.99,
                "first_charge_amount": 66.99,
                "last_charge_amount": 80.99,
                "price_change_pct": 20.9,
            },
        ),
        (
            "subscription_usage Webflow",
            f"""SELECT monthly_cost, days_since_login, max_charges_in_a_month
                FROM {container}.subscription_usage WHERE subscription_id = 'sub05'""",
            {"monthly_cost": 29, "days_since_login": 94, "max_charges_in_a_month": 1},
        ),
        (
            "subscription_usage Figma",
            f"""SELECT monthly_cost, max_charges_in_a_month, total_charged
                FROM {container}.subscription_usage WHERE subscription_id = 'sub03'""",
            {"monthly_cost": 15, "max_charges_in_a_month": 2, "total_charged": 105},
        ),
        (
            "ar_aging inv0031",
            f"""SELECT amount, due_date, paid_date, days_late, bucket, status
                FROM {container}.ar_aging WHERE invoice_id = 'inv0031'""",
            {
                "amount": 2400,
                "due_date": "2026-08-15",
                "paid_date": None,
                "days_late": 47,
                "bucket": "31-60",
                "status": "overdue",
            },
        ),
        (
            "ar_aging inv0038",
            f"""SELECT amount, due_date, paid_date, days_late, bucket, status
                FROM {container}.ar_aging WHERE invoice_id = 'inv0038'""",
            {
                "amount": 2400,
                "due_date": "2026-08-29",
                "paid_date": None,
                "days_late": 33,
                "bucket": "31-60",
                "status": "overdue",
            },
        ),
        (
            "cash_position closing balance",
            f"""SELECT balance FROM {container}.cash_position ORDER BY `date` DESC LIMIT 1""",
            {"balance": 8420},
        ),
        (
            "cash_position totals",
            f"""SELECT SUM(inflow) AS inflow, SUM(outflow) AS outflow
                FROM {container}.cash_position""",
            {"inflow": 52422, "outflow": 48802},
        ),
        (
            "client_profitability totals",
            f"""SELECT SUM(revenue_invoiced) AS invoiced, SUM(revenue_received) AS received
                FROM {container}.client_profitability""",
            {"invoiced": 57222, "received": 52422},
        ),
        (
            "fx_rates coverage",
            f"""SELECT COUNT(*) AS days, MIN(rate) AS min_rate
                FROM {container}.fx_rates""",
            {"days": 185},
        ),
    ]

    failures = 0
    for name, sql, expected in checks:
        try:
            row = runner.fetch_one(sql)
        except SetupError as error:
            print(f"FAIL {name}: {error}")
            failures += 1
            continue

        if name == "client_profitability c04 revenue received":
            expected_rows = [
                {"month": "2026-06-01", "revenue_invoiced": 2400, "revenue_received": 0},
                {"month": "2026-07-01", "revenue_invoiced": 2400, "revenue_received": 0},
                {"month": "2026-08-01", "revenue_invoiced": 1800, "revenue_received": 1800},
            ]
            result = runner.run(sql)
            actual_rows = [dict(zip(result.headers, values)) for values in result.rows]
            ok = len(actual_rows) == len(expected_rows)
            if ok:
                for actual, wanted in zip(actual_rows, expected_rows):
                    for key, wanted_value in wanted.items():
                        if key == "month":
                            ok = ok and str(actual.get(key))[:10] == wanted_value
                        else:
                            ok = ok and abs(numeric(actual.get(key)) - wanted_value) < 0.011
            if ok:
                print(f"PASS {name}")
            else:
                print(f"FAIL {name}: got {actual_rows}")
                failures += 1
            continue

        row_ok = True
        for key, wanted in expected.items():
            actual = row.get(key)
            if isinstance(wanted, (int, float)):
                try:
                    row_ok = row_ok and abs(numeric(actual) - float(wanted)) < 0.011
                except (SetupError, TypeError, ValueError):
                    row_ok = False
            elif wanted is None:
                row_ok = row_ok and (actual is None or actual == "" or actual == "null")
            elif key == "due_date":
                row_ok = row_ok and str(actual)[:10] == wanted
            else:
                row_ok = row_ok and str(actual).lower() == str(wanted).lower()
        if row_ok:
            print(f"PASS {name}")
        else:
            print(f"FAIL {name}: got {row}, expected {expected}")
            failures += 1

    if failures:
        print(f"\n{failures} verification check(s) failed.")
        return 1
    print("\nAll Zetaris verification checks passed.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="print SQL, call nothing")
    parser.add_argument("--verify-only", action="store_true", help="skip registration")
    parser.add_argument("--skip-verify", action="store_true", help="do not run the number checks")
    args = parser.parse_args()

    load_env()
    container = env("ZETARIS_VIEW_SCHEMA", "ledger_lens")
    pg_datasource = env("ZETARIS_PG_DATASOURCE", "ledger_lens_pg")
    values = substitutions(container, pg_datasource)

    statements: list[tuple[Path, str]] = []
    for path in setup_files(container):
        if not path.is_file():
            raise SetupError(f"missing {path}")
        for sql in render_sql(path, values):
            statements.append((path, sql))

    if args.dry_run:
        print(f"Zetaris setup dry run ({len(statements)} statements)")
        print(f"  REST URL: {env('ZETARIS_REST_URL', 'http://localhost:8888/api/v1.0')}")
        print(f"  Postgres seen as: {values['__PG_HOST__']}:{values['__PG_PORT__']}")
        for path, sql in statements:
            masked = re.sub(r'password\s+"[^"]*"', 'password "***"', sql, flags=re.IGNORECASE)
            print(f"\n[{path.relative_to(ROOT)}]")
            print_statement(masked)
        return 0

    api_key = env("ZETARIS_API_KEY")
    if not api_key:
        raise SetupError(
            "ZETARIS_API_KEY is empty. Create an API key in the Zetaris UI "
            "(http://localhost:3000) and put it in .env."
        )

    runner = ZetarisRunner(
        env("ZETARIS_REST_URL", "http://localhost:8888/api/v1.0"),
        api_key,
        env("ZETARIS_ORG_ID", "1"),
        max(1, int(env("ZETARIS_TIMEOUT_MS", "120000")) // 1000),
    )

    if not args.verify_only:
        print(f"Registering sources and creating views in '{container}'...")
        started = time.time()
        run_setup(runner, statements)
        print(f"Setup statements finished in {time.time() - started:.1f}s.")

    if args.skip_verify:
        print("Skipping verification.")
        return 0

    print("\nVerifying view numbers against data/README.md §8...")
    return verify(runner, container)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SetupError as error:
        print(f"\nERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
