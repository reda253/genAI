#!/usr/bin/env python3
"""Check the I5 money headline and leaks badge against the answer key.

I5 asks for three totals on the Brief banner (leaking per month, cash at risk,
and what today's 3 moves recover) and a Leaks badge that comes from the real
finding count. This script checks the API numbers and the rendered Brief page.
It exits 1 until those on-screen numbers exist, so it is expected to fail until
P6's I5 banner lands.

Usage:
    python evals/check_numbers.py
    python evals/check_numbers.py --url http://localhost:4000 --no-screen

The screen check uses headless Chrome/Chromium (``--dump-dom``), so it needs no
browser automation package. Pass ``--browser`` if Chrome is not on PATH.

Exit codes:
    0  every headline and badge check passed
    1  at least one number is missing or wrong
    2  an input, API, or browser error prevented the checks
"""

from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Sequence

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ANSWER_KEY = ROOT / "data" / "answer_key.json"
DEFAULT_SUMMARY = ROOT / "data" / "out" / "summary.json"
DEFAULT_URL = "http://localhost:4000"


class CheckError(Exception):
    """Raised when an input or the running app cannot be read."""


def read_json(source: str, label: str) -> Any:
    if source.startswith(("http://", "https://")):
        try:
            with urllib.request.urlopen(source, timeout=30) as response:
                raw = response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            hint = " (no finished run yet: POST /api/runs first)" if exc.code == 404 else ""
            raise CheckError(f"{label} URL {source} returned HTTP {exc.code}{hint}") from exc
        except (urllib.error.URLError, OSError) as exc:
            raise CheckError(f"cannot reach {source}: {exc}. Start the app first.") from exc
    else:
        try:
            raw = Path(source).read_text(encoding="utf-8-sig")
        except OSError as exc:
            raise CheckError(f"cannot read {label} file {source}: {exc}") from exc

    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise CheckError(f"{label} is not valid JSON: {source}: {exc}") from exc


def money(value: float) -> str:
    return f"€{value:,.2f}"


def sum_field(rows: Sequence[dict[str, Any]], field: str) -> float:
    return round(sum(float(row.get(field) or 0) for row in rows), 2)


def find_browser(explicit: str | None) -> str:
    if explicit:
        if shutil.which(explicit) or Path(explicit).is_file():
            return explicit
        raise CheckError(f"browser not found: {explicit}")

    candidates = [
        "google-chrome",
        "google-chrome-stable",
        "chromium",
        "chromium-browser",
        "chrome",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]
    for candidate in candidates:
        found = shutil.which(candidate)
        if found:
            return found
        if Path(candidate).is_file():
            return candidate
    raise CheckError("Chrome/Chromium not found; pass --browser <path> or use --no-screen")


def render(url: str, browser: str) -> str:
    command = [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--virtual-time-budget=15000",
        "--dump-dom",
        url,
    ]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise CheckError(f"could not render {url}: {exc}") from exc
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip().splitlines()[-1:] or ["unknown error"]
        raise CheckError(f"browser failed for {url}: {detail[0]}")
    if not result.stdout.strip():
        raise CheckError(f"browser returned an empty page for {url}")
    return result.stdout


def visible_lines(dom: str) -> list[str]:
    """Text lines from a rendered DOM, without tags, scripts, or styles."""
    without_code = re.sub(r"<(script|style)\b[^>]*>.*?</\1>", " ", dom, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", "\n", without_code)
    text = html.unescape(text)
    return [line.strip() for line in text.splitlines() if line.strip()]


class Checker:
    def __init__(self) -> None:
        self.failures = 0

    def check(self, label: str, passed: bool, detail: str) -> None:
        status = "PASS" if passed else "FAIL"
        print(f"  [{status}] {label}: {detail}")
        if not passed:
            self.failures += 1

    def has_amount(self, lines: Sequence[str], label: str, value: float) -> None:
        text = money(value)
        self.check(label, any(text in line for line in lines), f"expected {text} on screen")

    def equals(self, label: str, actual: Any, expected: Any) -> None:
        self.check(label, actual == expected, f"expected {expected}, got {actual}")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check the I5 headline and leaks badge against the answer key."
    )
    parser.add_argument("--url", default=DEFAULT_URL, help=f"running app (default: {DEFAULT_URL})")
    parser.add_argument(
        "--answer-key",
        type=Path,
        default=DEFAULT_ANSWER_KEY,
        help=f"answer-key JSON (default: {DEFAULT_ANSWER_KEY})",
    )
    parser.add_argument(
        "--summary",
        type=Path,
        default=DEFAULT_SUMMARY,
        help=f"generator summary JSON (default: {DEFAULT_SUMMARY})",
    )
    parser.add_argument("--browser", default=None, help="Chrome/Chromium executable")
    parser.add_argument(
        "--no-screen",
        action="store_true",
        help="only check the API numbers, not the rendered page",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    base = args.url.rstrip("/")

    try:
        answer_key = read_json(str(args.answer_key), "answer key")
        summary = read_json(str(args.summary), "summary")
        findings = read_json(base + "/api/findings", "findings")
        brief = read_json(base + "/api/brief", "brief")
    except CheckError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    if not isinstance(answer_key, list) or not answer_key:
        print(f"error: answer key must be a non-empty JSON array: {args.answer_key}", file=sys.stderr)
        return 2
    if not isinstance(findings, list) or not isinstance(brief, dict):
        print("error: findings/brief have an unexpected shape", file=sys.stderr)
        return 2

    expected_findings = len(answer_key)
    expected_leak = sum_field(answer_key, "monthly_impact_eur")
    # The answer key records the 4,800 risk in the late-payer note; summary.json
    # carries the same number as a field, so use that for the check.
    expected_risk = round(float(summary["unpaid_total_eur"]), 2)
    expected_cash = round(float(summary["closing_balance_eur"]), 2)
    moves = brief.get("moves") if isinstance(brief.get("moves"), list) else []
    expected_recovery = sum_field(moves, "monthly_impact_eur")
    finding_impact = {finding.get("id"): float(finding.get("monthly_impact_eur") or 0) for finding in findings}
    grounded_moves = all(
        round(sum(finding_impact.get(finding_id, 0) for finding_id in move.get("finding_ids", [])), 2)
        == round(float(move.get("monthly_impact_eur") or 0), 2)
        for move in moves
    )

    print("Ledger Lens I5 number checks")
    print(f"App:      {base}")
    print(f"Findings: {len(findings)} live, {expected_findings} in the answer key")
    print()

    checker = Checker()
    print("API:")
    checker.equals("findings count", len(findings), expected_findings)
    checker.equals("findings count in brief", brief.get("findings_count"), expected_findings)
    checker.equals("leaking per month", sum_field(findings, "monthly_impact_eur"), expected_leak)
    checker.equals("cash at risk", sum_field(findings, "cash_at_risk_eur"), expected_risk)
    checker.equals("cash today", round(float(brief.get("cash_today") or 0), 2), expected_cash)
    checker.equals("today's moves", len(moves), 3)
    checker.check("move amounts grounded in findings", grounded_moves, "each move equals its linked findings' impact")

    if not args.no_screen:
        try:
            lines = visible_lines(render(base + "/", find_browser(args.browser)))
        except CheckError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 2

        print()
        print("Brief page:")
        checker.check("brief rendered", "Good morning, Sara." in lines, "expected the Brief page, not a loading/empty state")
        checker.has_amount(lines, "available cash", expected_cash)
        checker.has_amount(lines, "leaking per month", expected_leak)
        checker.has_amount(lines, "cash at risk", expected_risk)
        checker.has_amount(lines, "top 3 moves recover", expected_recovery)

        try:
            leaks_index = lines.index("Leaks")
        except ValueError:
            leaks_index = -1
        badge = lines[leaks_index + 1] if leaks_index >= 0 and leaks_index + 1 < len(lines) else None
        checker.equals("leaks badge", badge, str(expected_findings))

    print()
    if checker.failures:
        print(f"{checker.failures} check(s) failed")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
