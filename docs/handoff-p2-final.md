# P2 final-plan handoff (Mon 26 Oct)

**Branch:** `p2-final` (local and pushed; **no PR yet**, as requested)  
**Built from:** `main` at `2d7d50b` (Contract v1.1, Docker, P4 engines, P6 web merged)  
**Owner:** Person 2 — Zetaris lead (Linux teammate)

This covers the P2 items in [final-plan.md](final-plan.md): **I3** entity SQL →
World Model ingest, **I6** Persona B Zetaris support, and **G4** data sources
documentation. The Zetaris screenshots (M7) are still blocked without a live
instance.

---

## What changed

| Task | Status | Where |
| --- | --- | --- |
| **I3** entity SQL → World Model | Done | `backend/src/zetaris/entitySql.ts`, `backend/src/agents/orchestrator.ts` |
| **I6** Persona B Zetaris support | Done (needs P3 data) | `zetaris/setup_zetaris.py`, `zetaris/generate_mocks.py`, `backend/src/config.ts` |
| **G4** data sources section | Done | `data/README.md` §12 |
| **M7** Zetaris screenshots | Blocked | no live Zetaris in this checkout |

### I3 — Client 360 data

- Added `ENTITY_SQL` for the full rows of:
  - `client_profitability` (54 rows)
  - `subscription_usage` (10 rows)
  - `ar_aging` (54 rows)
- `fetchEntityRows(ctx.sql)` runs the three queries in parallel through the
  existing SELECT-only Zetaris client.
- The orchestrator now runs them **after Leak Hunter**, passes the rows plus
  findings to `ingestZetarisData`, and traces
  `world_model_ingested {entities: 79}`.
- Non-blocking by design: if a view fails, findings still complete the brief.
- P4 can now build `GET /api/entities/:id` on a populated World Model using
  `getEntityContext`; P6 can open the Client 360 drawer.

### I6 — Persona B

The Zetaris side is ready; P3 owns the data.

```bash
# P3:
python data/generate.py --persona b
python data/load_postgres.py --db ledger_lens_b
python data/sanity_checks.py --db ledger_lens_b

# P2:
./zetaris/setup_zetaris.sh --persona b --dry-run
./zetaris/setup_zetaris.sh --persona b
python zetaris/generate_mocks.py --persona b
```

- Creates `ledger_lens_pg_b` + `ledger_lens_b` and the same four views.
- Writes `backend/src/zetaris/mock/b/*.json`.
- Persona B has no built-in expected values; the script skips the Persona A
  checks and points to the P5 eval. `--verify-only --persona b` is refused
  unless `--skip-verify` is passed.
- Backend switch:
  ```dotenv
  POSTGRES_DB=ledger_lens_b
  ZETARIS_VIEW_SCHEMA=ledger_lens_b
  ZETARIS_PG_DATASOURCE=ledger_lens_pg_b
  ZETARIS_MOCK=0
  ```
  or mock mode with `ZETARIS_MOCK=1` and
  `ZETARIS_MOCK_DIR=backend/src/zetaris/mock/b`.
- Override names: `ZETARIS_VIEW_SCHEMA_B`, `ZETARIS_PG_DATASOURCE_B`,
  `POSTGRES_DB_B`.

### G4 — data sources section

`data/README.md` §12 now documents:

- the generator seed (20261001), determinism, row counts and regeneration;
- the FX source: currency-api via jsDelivr, **CC0-1.0**, pinned 2026-10-01,
  repeated for the display window, one-rate limitation;
- Postgres → Zetaris registration and the Linux/Windows host rule;
- mock regeneration;
- known limitations.

---

## Verification (offline, this checkout)

```text
cd backend && npm test       -> 128 tests / 20 files passed
npm run typecheck            -> clean
python evals/check_findings.py --findings /tmp/findings.json
                             -> 6/6 found, 0 false alarms
./zetaris/setup_zetaris.sh --dry-run            -> 10 statements, persona A
./zetaris/setup_zetaris.sh --persona b --dry-run -> ledger_lens_b names
python zetaris/generate_mocks.py                -> A mocks unchanged
python zetaris/generate_mocks.py --persona b --input-dir data/out \
  --output-dir /tmp/...                         -> same shape, B CLI exercised
```

A mock backend run showed:

```json
{"step":"leak_hunter","event":"world_model_ingested","data":{"entities":79}}
```

and the findings eval still reports 6/6.

---

## What is still blocked

1. **Live Zetaris / screenshots.** Docker is not running here and there is no
   `zetaris-platform` bundle or registry credentials. The two README
   screenshots cannot be captured. Run `./zetaris/setup_zetaris.sh` on Reda's
   machine, then capture:
   - `docs/screenshots/zetaris-sources.png`
   - `docs/screenshots/zetaris-view.png`
2. **Persona B data.** Waiting on P3's `--persona b` generator, `ledger_lens_b`
   loader and `answer_key_b.json`. The Zetaris commands are ready.
3. **P4 endpoint.** `GET /api/entities/:id` is P4's task; the World Model now
   receives the rows it needs.
4. **P5 Persona B eval.** Run with
   `python evals/check_findings.py --answer-key data/answer_key_b.json`.
5. **M9 fresh-clone test.** P2 is on call; mock mode should work without
   Zetaris, and the Docker path should work from the p1-docker README.

---

## Commands for the integration machine

```bash
# Persona A (demo)
./zetaris/setup_zetaris.sh --dry-run
./zetaris/setup_zetaris.sh

# Persona B (after P3 data)
./zetaris/setup_zetaris.sh --persona b --dry-run
./zetaris/setup_zetaris.sh --persona b
python zetaris/generate_mocks.py --persona b

# Backend live
cd backend && npm run dev
curl -s http://localhost:4000/api/health
curl -s -X POST http://localhost:4000/api/runs
python evals/check_findings.py
```

## What to send back

- `./zetaris/setup_zetaris.sh --persona b` output (or the first error)
- the two screenshots
- Persona B eval line (`N/N found, 0 false alarms`)
- any number that differs from the persona's answer key
