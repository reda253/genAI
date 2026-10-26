#!/usr/bin/env python3
"""Run multi-cycle stability checks against Ledger Lens API.

Runs 5 full runs via the running backend API, checking:
- 6/6 leaks found with 0 false alarms on every run
- Consistent 3 move action_types across all runs
- Zero llm_failed events in trace logs
- Displays runtime duration per cycle
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from check_findings import (
    DEFAULT_ANSWER_KEY,
    ROOT,
    compare_findings,
    load_json_list,
)

DEFAULT_API_URL = "http://127.0.0.1:4000"
DEFAULT_LOGS_DIR = ROOT / "logs"


def api_request(url: str, method: str = "GET", data: dict[str, Any] | None = None) -> Any:
    body = json.dumps(data).encode("utf-8") if data is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def run_single_cycle(api_url: str, cycle_num: int, answer_key: list[dict[str, Any]], logs_dir: Path) -> dict[str, Any]:
    t0 = time.time()
    # 1. Start run
    start_resp = api_request(f"{api_url}/api/runs", method="POST", data={})
    run_id = start_resp.get("run_id")
    if not run_id:
        raise RuntimeError(f"POST /api/runs did not return run_id: {start_resp}")

    # 2. Poll until finished
    deadline = time.time() + 180  # 3 minutes max per run
    final_status = "running"
    while time.time() < deadline:
        status_resp = api_request(f"{api_url}/api/runs/{run_id}")
        final_status = status_resp.get("status")
        if final_status in ("done", "failed"):
            break
        time.sleep(1.5)

    duration = time.time() - t0
    if final_status != "done":
        raise RuntimeError(f"Run {run_id} failed or timed out with status: {final_status}")

    # 3. Fetch findings and brief
    findings = api_request(f"{api_url}/api/findings")
    brief = api_request(f"{api_url}/api/brief")

    # 4. Compare findings against ground truth
    eval_res = compare_findings(answer_key, findings)

    # 5. Extract move action_types
    moves = brief.get("moves", [])
    action_types = [m.get("action_type") for m in moves]

    # 6. Check trace log for llm_failed
    trace_file = logs_dir / f"{run_id}.jsonl"
    llm_failed_events = []
    if trace_file.exists():
        for line in trace_file.read_text(encoding="utf-8").splitlines():
            if line.strip():
                try:
                    entry = json.loads(line)
                    if entry.get("event") == "llm_failed":
                        llm_failed_events.append(entry)
                except Exception:
                    pass

    return {
        "cycle": cycle_num,
        "run_id": run_id,
        "duration_sec": round(duration, 2),
        "passed": eval_res.passed and len(llm_failed_events) == 0,
        "found_count": len(eval_res.found),
        "total_count": eval_res.total,
        "false_alarms": len(eval_res.false_alarms),
        "action_types": action_types,
        "llm_failed_count": len(llm_failed_events),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", type=int, default=5, help="Number of stability runs (default: 5)")
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help=f"Base API URL (default: {DEFAULT_API_URL})")
    parser.add_argument("--answer-key", default=DEFAULT_ANSWER_KEY, help="Path to answer_key.json")
    parser.add_argument("--logs-dir", default=DEFAULT_LOGS_DIR, help="Path to logs directory")
    args = parser.parse_args()

    api_url = args.api_url.rstrip("/")
    answer_key_path = Path(args.answer_key)
    logs_dir = Path(args.logs_dir)

    print(f"=== Ledger Lens Stability Benchmark ({args.runs} runs) ===")
    print(f"API URL:    {api_url}")
    print(f"Answer key: {answer_key_path}")

    # Check API health
    try:
        health = api_request(f"{api_url}/api/health")
        print(f"API Health: OK (Nightshift: {health.get('nightshift_status')}, Zetaris: {health.get('zetaris')})\n")
    except Exception as exc:
        print(f"ERROR: Cannot reach {api_url}/api/health: {exc}")
        print("Please ensure the backend is running (`npm run dev` in backend/).")
        return 2

    answer_key = load_json_list(answer_key_path, "answer key")

    results = []
    baseline_actions = None
    all_passed = True

    for cycle in range(1, args.runs + 1):
        print(f"Cycle {cycle}/{args.runs} starting...", end=" ", flush=True)
        try:
            res = run_single_cycle(api_url, cycle, answer_key, logs_dir)
            results.append(res)
            print(f"DONE in {res['duration_sec']}s | Leaks: {res['found_count']}/{res['total_count']} (false alarms: {res['false_alarms']}) | Actions: {res['action_types']}")

            if baseline_actions is None:
                baseline_actions = res["action_types"]
            elif res["action_types"] != baseline_actions:
                print(f"  WARNING: Action types mismatch! Expected {baseline_actions}, got {res['action_types']}")
                all_passed = False

            if not res["passed"]:
                all_passed = False

        except Exception as exc:
            print(f"FAILED: {exc}")
            all_passed = False
            break

    print("\n=== Stability Summary ===")
    print(f"{'Run':<6} {'Run ID':<24} {'Time':<8} {'Leaks':<10} {'False':<8} {'LLM Failed':<12} {'Actions'}")
    print("-" * 85)
    for r in results:
        actions_str = ", ".join(r["action_types"])
        print(f"{r['cycle']:<6} {r['run_id']:<24} {str(r['duration_sec']) + 's':<8} {f'{r['found_count']}/{r['total_count']}':<10} {r['false_alarms']:<8} {r['llm_failed_count']:<12} {actions_str}")

    if all_passed and len(results) == args.runs:
        print(f"\nPASS: All {args.runs} runs succeeded with 6/6 leaks found, 0 false alarms, and 0 llm_failed.")
        return 0
    else:
        print(f"\nFAIL: Stability benchmark failed.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
