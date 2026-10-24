# Zetaris layer (P2)

This folder is the whole Data layer: the Postgres datasource, the public FX
source, the four contract views, the TypeScript client the agents call, and the
one-command setup script.

The rule from [docs/contracts.md](../docs/contracts.md): **agents never read raw
tables.** They call `querySql()` in `backend/src/zetaris/client.ts`; the four
views are the only shape they see.

| File | What |
| --- | --- |
| `sources/postgres.sql` | Registers `ledger_lens_pg` (Postgres on host port 5433) and imports the five tables |
| `sources/fx_rates.sql` | Registers the public EUR/MAD REST source and the display-only `fx_rates` view |
| `views/00_container.sql` | Creates the `ledger_lens` SchemaStore container |
| `views/client_profitability.sql` | One row per client per month; unbilled hours, rates, revenue |
| `views/cash_position.sql` | One row per day; inflow, outflow, net, running balance |
| `views/subscription_usage.sql` | One row per subscription; price rise, unused, duplicate charge |
| `views/ar_aging.sql` | One row per invoice; days late and aging bucket |
| `catalog.json` | One-line descriptions of every view and column, for prompts and reviewers |
| `setup_zetaris.sh` | One command: sources + container + views + verification |
| `setup_zetaris.py` | The runner behind the shell script (also `--dry-run`, `--verify-only`) |
| `generate_mocks.py` | Rebuilds `backend/src/zetaris/mock/*.json` from `data/out/*.csv` |
| `../backend/src/zetaris/client.ts` | SELECT-only client with `ZETARIS_MOCK=1` fixture mode |

## Prerequisites

1. Zetaris is running locally and `./verify.sh` reports **9/9 passed**
   (see the Participant Setup Guide, steps 1.3–1.8). The REST API is
   `http://localhost:8888/api/v1.0`; the UI is `http://localhost:3000`.
2. Postgres is up on port 5433 and loaded:

   ```bash
   docker compose -f infra/docker-compose.yml up -d
   python data/generate.py
   python data/load_postgres.py
   python data/sanity_checks.py
   ```

3. An API key from the Zetaris UI (user menu → API keys), in `.env`:

   ```dotenv
   ZETARIS_API_KEY=...
   ZETARIS_REST_URL=http://localhost:8888/api/v1.0
   ZETARIS_ORG_ID=1
   ZETARIS_MOCK=0
   ```

   Never commit `.env`.

## One command

```bash
./zetaris/setup_zetaris.sh
```

It runs the SQL in this order:

1. `CREATE DATASOURCE ledger_lens_pg` (PostgreSQL JDBC) and
   `REGISTER DATASOURCE TABLES`;
2. `CREATE SCHEMASTORE CONTAINER ledger_lens`;
3. the four `CREATE OR REPLACE SCHEMASTORE VIEW` statements;
4. `CREATE LIGHTNING DATABASE fx_rest`, the REST table `eur_reference`, and
   the `fx_rates` view;
5. the number checks in the next section.

Preview it without touching Zetaris:

```bash
./zetaris/setup_zetaris.sh --dry-run
```

Re-runs are safe for views (`CREATE OR REPLACE`). A container, datasource, or
REST table that already exists is kept and reported; the script does not drop
anything.

### The Postgres host from inside Zetaris

`localhost` inside a Zetaris container is the container itself, not your
laptop. The script auto-detects a host address:

- Docker Desktop (Windows/macOS): `host.docker.internal`;
- Linux: the `docker0` bridge address (for example `172.17.0.1`), or a custom
  `br-*` bridge.

Override it when your install uses another address:

```dotenv
ZETARIS_PG_HOST=192.168.1.42
```

The port is the host-published port `5433`, not the container's `5432`.

## Expected numbers

The verifier checks these rows from [data/README.md](../data/README.md) §8
against the live views:

| View | Entity | Expected |
| --- | --- | --- |
| `client_profitability` | c01, Aug 2026 | 52 logged, 40 billed, 12 unbilled, 23.08% |
| `client_profitability` | c01, Sep 2026 | 50 logged, 40 billed, 10 unbilled, 20.00% |
| `client_profitability` | c07, Sep 2026 | 30/30 hours, €42 vs €60 market, €1,260 invoiced |
| `client_profitability` | c04, Jun/Jul/Aug | €2,400/€2,400/€1,800 invoiced; €0/€0/€1,800 received |
| `subscription_usage` | sub02 Adobe | €66.99 → €80.99, +20.9% |
| `subscription_usage` | sub05 Webflow | €29/month, 94 days since login, 1 charge/month |
| `subscription_usage` | sub03 Figma | €15/month, 2 charges in August, €105 total |
| `ar_aging` | inv0031 | €2,400, due 2026-08-15, 47 days late, `31-60` |
| `ar_aging` | inv0038 | €2,400, due 2026-08-29, 33 days late, `31-60` |
| `cash_position` | last day | balance €8,420.00 |
| totals | — | invoiced €57,222; received €52,422; outflow €48,802 |

The script prints `PASS`/`FAIL` per row and exits non-zero on a mismatch.

## Mock mode (no Zetaris)

`ZETARIS_MOCK=1` makes `querySql()` read the committed fixtures in
`backend/src/zetaris/mock/` instead of calling Zetaris. The fixtures are
generated from the same dataset, so they carry the same six leaks and the same
`cash_today` value.

```bash
python data/generate.py          # writes data/out/*.csv (gitignored)
python zetaris/generate_mocks.py # rebuilds backend/src/zetaris/mock/*.json
cd backend && npm test           # includes the mock-view integration test
```

The mock client applies the simple `WHERE col op value` filters the Leak Hunter
uses, so a mock run returns six findings, not 54 rows of noise. Switch to the
real views with `ZETARIS_MOCK=0` after `setup_zetaris.sh` passes.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Zetaris 401` | API key missing/wrong; create one in the UI and restart the backend |
| `Zetaris 400` on every call | `ZETARIS_ORG_ID` is not numeric, or `X-Request-ID` is not a UUID (the client generates it) |
| `Cannot reach http://localhost:8888` | Zetaris is stopped; `cd zetaris-platform && docker compose start` |
| `CREATE DATASOURCE` fails to connect | `ZETARIS_PG_HOST` is wrong for the container network; use the bridge/LAN IP, not `localhost` |
| `No suitable driver` / class not found | The Zetaris image should bundle `org.postgresql.Driver`; check the platform version |
| `A container named "ledger_lens" already exists` | Safe to ignore; the script treats it as success |
| A view returns old numbers | `CREATE OR REPLACE` invalidates caches per Zetaris docs; re-run the script, then re-query |
| `JdbcSQLException` in the setup output | Postgres is not loaded yet; run `data/load_postgres.py` first |
| `fx_rates` returns no rows | The public API is unreachable from the containers; `TEST REST REQUEST` with the same endpoint, or set `ZETARIS_FX_ENDPOINT` |

## Screenshots for the README (integration machine)

Two screenshots are still to be captured on the machine that runs Zetaris
(this repo checkout has no Zetaris bundle):

1. **Sources:** Zetaris UI → Data Explorer → show `ledger_lens_pg` with the five
   imported tables and `fx_rest.eur_reference`.
2. **View query:** SQL Editor running

   ```sql
   SELECT client_id, client_name, `month`, unbilled_hours, unbilled_pct
   FROM ledger_lens.client_profitability
   WHERE client_id = 'c01'
   ORDER BY `month`;
   ```

   with the 52/40/12 (23.08%) and 50/40/10 (20.00%) rows visible.

Save them as `docs/screenshots/zetaris-sources.png` and
`docs/screenshots/zetaris-view.png`, then link them from the root README.
