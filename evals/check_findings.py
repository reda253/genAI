#!/usr/bin/env python3
"""Compare Leak Hunter findings with the Ledger Lens answer key.

Matching is one-to-one on ``(type, client_id, subscription_id)``. This keeps
the eval focused on whether each planted leak was found, while duplicate or
unexpected findings show up as false alarms.

Exit codes:
    0  every answer-key leak was found and there were no false alarms
    1  at least one leak was missed or at least one false alarm was reported
    2  an input file was missing, invalid, or empty
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ANSWER_KEY = ROOT / "data" / "answer_key.json"
DEFAULT_FINDINGS = ROOT / "web" / "src" / "mock" / "findings.json"


class EvalInputError(Exception):
    """Raised when an eval input cannot be loaded or validated."""


@dataclass(frozen=True)
class EvalResult:
    found: list[tuple[dict[str, Any], dict[str, Any]]]
    missed: list[dict[str, Any]]
    false_alarms: list[dict[str, Any]]

    @property
    def total(self) -> int:
        return len(self.found) + len(self.missed)

    @property
    def passed(self) -> bool:
        return not self.missed and not self.false_alarms


def load_json_list(path: str | Path, label: str) -> list[dict[str, Any]]:
    """Load a JSON array of objects, raising EvalInputError on bad input."""
    file_path = Path(path)
    try:
        raw = file_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise EvalInputError(f"cannot read {label} file {file_path}: {exc}") from exc

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise EvalInputError(f"{label} file is not valid JSON: {file_path}: {exc}") from exc

    if not isinstance(data, list):
        raise EvalInputError(f"{label} file must contain a JSON array: {file_path}")
    for index, item in enumerate(data):
        if not isinstance(item, dict):
            raise EvalInputError(
                f"{label} entry {index} must be a JSON object: {file_path}"
            )
    return data


def match_key(item: dict[str, Any]) -> tuple[Any, Any, Any]:
    """Return the identity used to pair a finding with an answer-key entry."""
    leak_type = item.get("type")
    if isinstance(leak_type, str):
        leak_type = leak_type.strip().lower()
    return (leak_type, item.get("client_id"), item.get("subscription_id"))


def compare_findings(
    answer_key: Sequence[dict[str, Any]],
    findings: Sequence[dict[str, Any]],
) -> EvalResult:
    """Match findings to answer-key entries, one finding per planted leak."""
    remaining = list(answer_key)
    found: list[tuple[dict[str, Any], dict[str, Any]]] = []
    false_alarms: list[dict[str, Any]] = []

    for finding in findings:
        key = match_key(finding)
        match_index = next(
            (index for index, expected in enumerate(remaining) if match_key(expected) == key),
            None,
        )
        if match_index is None:
            false_alarms.append(finding)
            continue
        found.append((remaining.pop(match_index), finding))

    return EvalResult(found=found, missed=remaining, false_alarms=false_alarms)


def entity_label(item: dict[str, Any]) -> str:
    client_id = item.get("client_id")
    if client_id:
        return str(client_id)
    subscription_id = item.get("subscription_id")
    if subscription_id:
        return str(subscription_id)
    return "no entity"


def describe_key(item: dict[str, Any]) -> str:
    leak_type = item.get("type") or "unknown"
    return f"{leak_type} ({entity_label(item)})"


def print_report(
    result: EvalResult,
    answer_key_path: str | Path,
    findings_path: str | Path,
) -> None:
    finding_count = len(result.found) + len(result.false_alarms)
    print("Ledger Lens findings eval")
    print(f"Answer key: {answer_key_path} ({result.total} leaks)")
    print(f"Findings:  {findings_path} ({finding_count} findings)")
    print()

    print("Found:")
    if result.found:
        for expected, actual in result.found:
            actual_id = actual.get("id") or "?"
            title = actual.get("title")
            suffix = f" - {title}" if title else ""
            print(f"  [x] {describe_key(expected)} -> {actual_id}{suffix}")
    else:
        print("  (none)")

    print()
    print("Missed:")
    if result.missed:
        for expected in result.missed:
            note = expected.get("note")
            suffix = f" - {note}" if note else ""
            print(f"  [ ] {describe_key(expected)}{suffix}")
    else:
        print("  (none)")

    print()
    print("False alarms:")
    if result.false_alarms:
        for finding in result.false_alarms:
            finding_id = finding.get("id") or "?"
            title = finding.get("title")
            suffix = f" - {title}" if title else ""
            print(f"  [!] {finding_id}: {describe_key(finding)}{suffix}")
    else:
        print("  (none)")

    print()
    false_alarm_count = len(result.false_alarms)
    false_alarm_label = "false alarm" if false_alarm_count == 1 else "false alarms"
    print(
        f"{len(result.found)}/{result.total} found, "
        f"{false_alarm_count} {false_alarm_label}"
    )


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compare Leak Hunter findings with the Ledger Lens answer key."
    )
    parser.add_argument(
        "--findings",
        type=Path,
        default=DEFAULT_FINDINGS,
        help=f"findings JSON array (default: {DEFAULT_FINDINGS})",
    )
    parser.add_argument(
        "--answer-key",
        type=Path,
        default=DEFAULT_ANSWER_KEY,
        help=f"answer-key JSON array (default: {DEFAULT_ANSWER_KEY})",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        answer_key = load_json_list(args.answer_key, "answer key")
        if not answer_key:
            raise EvalInputError(f"answer key is empty: {args.answer_key}")
        findings = load_json_list(args.findings, "findings")
    except EvalInputError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    result = compare_findings(answer_key, findings)
    print_report(result, args.answer_key, args.findings)
    return 0 if result.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
