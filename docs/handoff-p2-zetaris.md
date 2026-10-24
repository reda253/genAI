# P2 → Reda handoff: Zetaris data layer

**Branch:** `p2-zetaris`  
**PR:** [#6](https://github.com/reda253/genAI/pull/6)  
**Owner:** Person 2 — Zetaris lead (Linux teammate)  
**Status:** code complete; live Zetaris verification and screenshots need the integration machine.

---

## TL;DR

The P2 Zetaris layer is implemented on `p2-zetaris`:

- SELECT-only Zetaris client wired into the backend
- four contract views + `fx_rates`
- Postgres and public FX sources
- one-command setup + verification script
- committed mock view rows
- view/column catalog
- README and troubleshooting

Everything that can be tested without a live Zetaris instance passes:

- `npm test`: **92 tests / 12 files**
- `npm run typecheck`: clean
- `python evals/check_findings.py`: **6/6 leaks, 0 false alarms**
- view SQL vs committed mocks: **0 differing cells**
- `./zetaris/setup_zetaris.sh --dry-run`: 10 statements, password masked

What is missing is a machine with **Zetaris actually running** (the platform bundle + registry credentials + Docker + Postgres). I do not have that bundle on this checkout, so I could not run the live script or take the two screenshots. You already have a working Zetaris install and the integration machine, so the practical next step is for you to run the checklist below.

This is **not** a code permission issue: anyone with the Zetaris platform bundle and registry credentials can run it. You are just the person who already has that environment.

---

## Why it could not be verified here

- Docker daemon is not running in this checkout.
- There is no `zetaris-platform.zip` / `zetaris-platform` folder.
- There are no `zetarishackathon.azurecr.io` registry credentials.
- Nightshift/Nemotron is not configured either, so the model-backed agents used their deterministic fallbacks.

The setup script itself is dry-run tested, and its verification logic was tested with a fake Zetaris runner. The four view SQL files were parsed with a Spark SQL parser; their logic was translated to DuckDB and executed against the same data, and the output matches the committed mocks cell-by-cell. The remaining risk is **Zetaris-version-specific SQL/connector behaviour**, which only a live run can prove.

---

## What is in the PR

| Path | What |
|---|---|
| `backend/src/zetaris/client.ts` | `querySql(sql)` with Bearer key, `X-Org-ID`, fresh `X-Request-ID`, SELECT-only guard, `{rows, sql, ranAt}`, mock mode, view qualification |
| `backend/src/main.ts` | client wired into the orchestrator and `/api/health` |
| `backend/src/config.ts` | `ZETARIS_VIEW_SCHEMA`, `ZETARIS_QUERY_LIMIT`, `ZETARIS_TIMEOUT_MS` |
| `backend/src/zetaris/mock/*.json` | view-shaped fixtures for `client_profitability`, `cash_position`, `subscription_usage`, `ar_aging`, `fx_rates` |
| `zetaris/views/*.sql` | the four contract views + container |
| `zetaris/sources/postgres.sql` | `ledger_lens_pg` datasource + table import |
| `zetaris/sources/fx_rates.sql` | public EUR/MAD REST source + display-only `fx_rates` view |
| `zetaris/setup_zetaris.sh` / `.py` | one-command register/create/verify; `--dry-run`, `--verify-only`, `--skip-verify` |
| `zetaris/catalog.json` | view/column descriptions for prompts and reviewers |
| `zetaris/generate_mocks.py` | rebuilds mocks from `data/out/*.csv` |
| `zetaris/README.md` | detailed setup, host networking, troubleshooting, screenshot checklist |
| `backend/test/zetaris.test.ts` | client, SELECT guard, qualification, mock filters, HTTP shape |
| `backend/test/zetaris.integration.test.ts` | mock views → Leak Hunter → exactly the six answer-key findings |

### Integration fix included in the PR

While wiring the real views I found two Leak Hunter bugs that mocks had hidden:

1. **Unbilled hours were valued with `effective_rate`**, which is `revenue_invoiced / hours_logged` and is diluted by the unbilled hours themselves. Atlas is now **22h × €60 = €1,320** instead of €1,033.80.
2. **`underpriced_service` matched every client slightly below market.** It now uses the dataset's healthy-control boundary (`hourly_rate < market_rate * 0.9`), so only Kestrel fires.

These are in the separate commit `1e3adbc` so they can be reviewed or cherry-picked independently.

---

## What Reda needs to do

### 0. Preconditions

- [ ] Zetaris is running and `./verify.sh` prints **9/9 passed**.
- [ ] Postgres is up on host port **5433** (Docker Desktop/WSL or native Linux).
- [ ] The dataset is loaded:

  ```bash
  docker compose -f infra/docker-compose.yml up -d
  python data/generate.py
  python data/load_postgres.py
  python data/sanity_checks.py
  ```

- [ ] Node 20 for the backend.
- [ ] You are on the `p2-zetaris` branch (or have checked out PR #6):

  ```bash
  git fetch origin
  git checkout p2-zetaris
  # or: gh pr checkout 6
  ```

### 1. Configure `.env`

Use your own values; never commit `.env`.

```dotenv
# Zetaris
ZETARIS_API_KEY=<key created in the Zetaris UI>
ZETARIS_REST_URL=http://localhost:8888/api/v1.0
ZETARIS_ORG_ID=1
ZETARIS_MOCK=0
ZETARIS_VIEW_SCHEMA=ledger_lens
ZETARIS_PG_DATASOURCE=ledger_lens_pg
# Host as seen from INSIDE the Zetaris containers.
# Docker Desktop (Windows/WSL/macOS): host.docker.internal
# Linux native: docker0 bridge IP or the LAN IP, never localhost
ZETARIS_PG_HOST=host.docker.internal
ZETARIS_QUERY_LIMIT=1000
ZETARIS_TIMEOUT_MS=120000

# Postgres (host side)
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_DB=ledger_lens
POSTGRES_USER=ledger
POSTGRES_PASSWORD=ledger_dev
```

**Important:** `ZETARIS_PG_HOST` is not `localhost`. Inside a Zetaris container, `localhost` is the container itself. On Linux, if `host.docker.internal` does not resolve, use the host's docker bridge IP (for example `172.17.0.1`) or the LAN IP.

### 2. Dry run first

```bash
./zetaris/setup_zetaris.sh --dry-run
```

Expected:

```text
Zetaris setup dry run (10 statements)
  REST URL: http://localhost:8888/api/v1.0
  Postgres seen as: host.docker.internal:5433
...
```

The password must appear as `password "***"`. If the host looks wrong, fix `ZETARIS_PG_HOST` before continuing.

### 3. Run the real setup

```bash
./zetaris/setup_zetaris.sh
```

It will:

1. `CREATE DATASOURCE ledger_lens_pg` + `REGISTER DATASOURCE TABLES`
2. `CREATE SCHEMASTORE CONTAINER ledger_lens`
3. create/replace the four views
4. register `fx_rest` + create the `fx_rates` view
5. run 13 verification checks

**Expected ending:**

```text
All Zetaris verification checks passed.
```

`already exists, keeping it` for the container/datasource/REST table is fine. The script does not drop anything.

### 4. If a step fails

Send the exact command output plus:

```sql
SHOW SERVER VERSION;
SHOW DATASOURCES;
SHOW LIGHTNING DATABASES;
SHOW DATASOURCE TABLES ledger_lens_pg;
```

| Symptom | Likely cause / fix |
|---|---|
| `HTTP 401` | API key wrong or expired. Create a new key in the Zetaris UI; put it in `.env`; run again. |
| `HTTP 400` on every call | `ZETARIS_ORG_ID` must be numeric (`1` on a local install). The script generates a fresh UUID for `X-Request-ID`. |
| `Cannot reach http://localhost:8888` | Zetaris REST API is not up. `docker compose ps`, then `./verify.sh`. |
| `CREATE DATASOURCE` connection refused/timeout | `ZETARIS_PG_HOST` is wrong for the container network. Use `host.docker.internal` on Docker Desktop, or the docker0/LAN IP on Linux. Confirm Postgres is published on `5433`. |
| `password authentication failed` | `.env` password differs from the one used when the Postgres volume was created. Either use the original password or recreate the volume (`docker compose ... down -v` — destructive). |
| `No suitable driver` / `org.postgresql.Driver` | The Zetaris image is missing the PostgreSQL JDBC driver. Report the Zetaris version. |
| `REGISTER DATASOURCE TABLES` fails | Postgres tables are not loaded. Run `python data/load_postgres.py`; retry `REGISTER DATASOURCE TABLES FROM ledger_lens_pg`. |
| `A container named "ledger_lens" already exists` | Safe; the script treats it as success. |
| A view-creation SQL error | Copy the exact error and `SHOW SERVER VERSION`. It may be a Spark/Lightning version difference; do not guess-edit the views without telling me. |
| `fx_rates` empty | The public FX source is unreachable from the containers. Test the endpoint with `TEST REST REQUEST` and check `curl` from the host. You can override `ZETARIS_FX_ENDPOINT` in `.env`. |
| Verification numbers differ | Postgres may hold a different dataset revision. Run `python data/sanity_checks.py`; confirm the `data-v1` values. |

### 5. Verify the numbers in the Zetaris UI

SQL Editor:

```sql
SELECT client_id, client_name, `month`, hours_logged, hours_billed,
       unbilled_hours, unbilled_pct
FROM ledger_lens.client_profitability
WHERE client_id = 'c01'
ORDER BY `month`;
```

Expected: August **52 / 40 / 12 / 23.08**, September **50 / 40 / 10 / 20.00**.

```sql
SELECT invoice_id, amount, due_date, paid_date, days_late, bucket, status
FROM ledger_lens.ar_aging
WHERE invoice_id IN ('inv0031', 'inv0038')
ORDER BY invoice_id;
```

Expected: `inv0031` €2,400, due 2026-08-15, 47 days late, `31-60`, `overdue`; `inv0038` €2,400, due 2026-08-29, 33 days late, `31-60`, `overdue`.

```sql
SELECT subscription_id, monthly_cost, first_charge_amount,
       last_charge_amount, price_change_pct, days_since_login,
       max_charges_in_a_month, total_charged
FROM ledger_lens.subscription_usage
WHERE subscription_id IN ('sub02', 'sub03', 'sub05')
ORDER BY subscription_id;
```

Expected: Adobe €66.99 → €80.99 (+20.9%); Figma 2 charges in August, €105 total; Webflow 94 days since login.

### 6. Take the two screenshots

Save them as:

- `docs/screenshots/zetaris-sources.png` — Data Explorer showing `ledger_lens_pg` with the five imported tables and `fx_rest.eur_reference`.
- `docs/screenshots/zetaris-view.png` — SQL Editor with the `client_profitability` query above showing the 52/40/12 and 50/40/10 rows.

Commit them to `p2-zetaris` (or send them to me and I will). Then the README screenshot checklist is complete.

### 7. Run the backend against live views

In one terminal:

```bash
cd backend
npm install
npm run dev
```

In another:

```bash
curl -s http://localhost:4000/api/health
# expect "zetaris": true

RUN=$(curl -s -X POST http://localhost:4000/api/runs | python3 -c "import sys,json; print(json.load(sys.stdin)['run_id'])")
curl -s http://localhost:4000/api/runs/$RUN
curl -s http://localhost:4000/api/findings > /tmp/findings-live.json
curl -s http://localhost:4000/api/brief
```

Then:

```bash
python evals/check_findings.py --findings /tmp/findings-live.json
```

Expected: **6/6 found, 0 false alarms**.

Also check:

- `logs/<run_id>.jsonl` has start/done lines for `leak_hunter`, `explainer`, `forecaster`, `cfo`.
- `/api/brief` has `cash_today = 8420` and exactly 3 moves.
- Each finding's `evidence[0].sql` uses `ledger_lens.<view>` and the same rows the UI showed.

### 8. Switch the web app when P6 is merged

P6's `p6-web` branch is still unmerged. When it lands:

- set `VITE_USE_MOCKS=false`
- set `VITE_API_URL=http://localhost:4000`
- its `web/src/currency.ts` currently hardcodes **10.82 MAD/EUR**; the `fx_rates` view returns **10.99916935** for the demo date. It should read the view or at least use the same value.

---

## What to send back

Please reply with:

- [ ] `./zetaris/setup_zetaris.sh` full output (or the first error)
- [ ] `SHOW SERVER VERSION`, `SHOW DATASOURCES`, `SHOW LIGHTNING DATABASES`
- [ ] the two screenshots
- [ ] `/tmp/findings-live.json` + eval result
- [ ] any number that differs from `data/README.md` §8

If everything passes, merge PR #6 and I will update the README with the screenshots and the final "live verified" note.

---

## Other blockers I noticed (not part of this PR)

These are project-level risks, not P2 code issues:

1. **P4 engines are missing.** `p4-engines` has no commits beyond `main`; `backend/src/engines/*` contains only `.gitkeep`. The hackathon requires at least one working Meterless engine (World Model, H-MEM, or Markovian). This is currently the biggest gap for the Build requirement.
2. **P6 dashboard is unmerged.** `p6-web` has the four screens and approval flow, but it is not on `main`; until it is, the demo has no UI.
3. **Nightshift needs the runtime token + NVIDIA key** for real Nemotron calls. The mock pipeline works with deterministic fallbacks, but the model-backed Explainer/CFO will not use Nemotron until that is configured.
4. **FX rate mismatch:** P6 hardcodes 10.82; the real FX view gives 10.99916935 for 2026-10-01. Align before the demo.

---

## Reference commands

```bash
# Offline checks (no Zetaris)
cd backend && npm test && npm run typecheck
python evals/check_findings.py --findings /tmp/findings.json

# Setup preview
./zetaris/setup_zetaris.sh --dry-run

# Live setup + verify
./zetaris/setup_zetaris.sh

# Verify only
./zetaris/setup_zetaris.sh --verify-only

# Rebuild mocks after data changes
python data/generate.py && python zetaris/generate_mocks.py
```
