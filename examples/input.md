# Example run

This folder is one captured run of the app, copied from its API responses and
trace. It is not a set of hand-written fixtures: `brief.json`, `findings.json`,
`explanation.json`, and `trace.jsonl` all belong to the run below.

## Snapshot

| | |
|---|---|
| Run id | `run_20261025_133016` |
| Captured | 2026-10-25T13:30:16Z |
| App | `docker compose up -d --build`, <http://localhost:4000> |
| Dataset | `data-v1`, seed `20261001`, window 2026-04-01 → 2026-09-30 |
| Demo date in the data | 2026-10-01 (the timestamps above are the real capture time) |
| Zetaris | `ZETARIS_MOCK=1`, the committed view fixtures used by Docker Level 1 |
| Nightshift | not running in this capture; `/api/health` reported `nightshift_status: "unauthorized"` |
| Models configured | `nvidia/nemotron-3.5-lightning-30b-a3b` (fast), `nvidia/nemotron-3-ultra-550b-a55b` (deep) |
| Result | `done`, 6 findings, `6/6 found, 0 false alarms` |

> **Environment note:** because Nightshift was not running when this run was
> captured, the agents used their deterministic backups. The trace records the
> failed model calls (`llm_failed`). The six leaks, their amounts, and every
> evidence row still come from the four contract views (the committed fixtures
> in this Level 1 setup), not from hand-written output. To replace this trace
> with a live Nemotron run, start Nightshift, set
> `METERLESS_RUNTIME_TOKEN`, run again, and copy `logs/<run_id>.jsonl` here.

## Default question

```text
Why did my margin drop in September?
```

## Run settings

```text
POST /api/runs
content-type: application/json
body: (empty)
```

The run executes Leak Hunter → Explainer → Forecaster → CFO. The API calls used
to capture the files in this folder:

```bash
curl -sS -X POST http://localhost:4000/api/runs \
  -H 'content-type: application/json'

# poll until "status": "done"
curl -sS http://localhost:4000/api/runs/run_20261025_133016

curl -sS http://localhost:4000/api/brief > brief.json
curl -sS http://localhost:4000/api/findings > findings.json

curl -sS -X POST http://localhost:4000/api/explain \
  -H 'content-type: application/json' \
  -d '{"question":"Why did my margin drop in September?","finding_id":null}' \
  > explanation.json

docker compose exec -T app \
  cat /app/logs/run_20261025_133016.jsonl > trace.jsonl
```

## What-if bodies

Both are posted to `POST /api/forecast/what-if` with
`content-type: application/json`.

Lose the late-paying client (`c04` is Nordwind Studio, the 4,800 EUR at risk):

```json
{ "type": "lose_client", "client_id": "c04" }
```

Raise prices by 10%:

```json
{ "type": "raise_prices", "pct": 10 }
```

## Files

| File | What |
|---|---|
| `brief.json` | `GET /api/brief`: cash today, what changed, three ranked moves |
| `findings.json` | `GET /api/findings`: the six leaks with their evidence rows |
| `explanation.json` | `POST /api/explain` for the default question |
| `trace.jsonl` | one JSON object per line, in file order, from `logs/<run_id>.jsonl` |

The eval-only `data/answer_key.json` is deliberately not copied here.
