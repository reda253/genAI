# Ledger Lens data-v1 handoff

**Status:** ready  
**Tag:** `data-v1`  
**Commit:** `93e3af3`  
**Branch:** `data-engineer`  
**Demo date:** `2026-10-01`  
**Data window:** April–September 2026

The tag and branch are pushed to `origin`. To fetch the tag locally:

```bash
git fetch --tags
```

The source of truth for the dataset is `data/README.md`. The schema, view, and JSON contracts are in `docs/contracts.md`.

## Dataset summary

| Table | Rows |
|---|---:|
| `clients` | 9 |
| `subscriptions` | 10 |
| `invoices` | 54 |
| `time_logs` | 132 |
| `bank_transactions` | 168 |

Key totals:

- Invoice revenue: **€57,222.00**
- Cash receipts: **€52,422.00**
- Cash expenses: **€48,802.00**
- Closing cash: **€8,420.00**
- Six leaks: **€1,918.00/month**
- Cash at risk: **€4,800.00**

## Database connection

| Setting | Value |
|---|---|
| Host from your machine | `127.0.0.1` |
| Host from inside Zetaris containers | `host.docker.internal` or the LAN IP |
| Port | `5433` |
| Database | `ledger_lens` |
| User | `ledger` |
| Password | `ledger_dev` or the value in `.env` |
| Container | `ledger-lens-postgres` |
| Volume | `ledger_lens_pgdata` |

Connection string from the host:

```text
postgresql://ledger:ledger_dev@127.0.0.1:5433/ledger_lens
```

Do **not** use `localhost` from inside the Zetaris containers. On Linux, use the LAN IP if `host.docker.internal` is not configured.

The database is already loaded. To rebuild the five synthetic tables:

```bash
python data/load_postgres.py
```

This drops and recreates the contract tables, then loads the CSVs in one transaction.

## Person 2 — Zetaris

1. Register the Postgres database as a Lightning source using the connection details above.
2. Build the four contract views:
   - `client_profitability`
   - `cash_position`
   - `subscription_usage`
   - `ar_aging`
3. Compare the results with the expected values in `data/README.md` §8.

Key rows to check:

| View | Entity | Expected values |
|---|---|---|
| `client_profitability` | c01, Aug 2026 | 52 logged, 40 billed, 12 unbilled, 23.08% |
| `client_profitability` | c01, Sep 2026 | 50 logged, 40 billed, 10 unbilled, 20.00% |
| `client_profitability` | c07, Sep 2026 | 30 logged/billed, €42 rate, €60 market, €1,260 invoiced |
| `client_profitability` | c04, Jun 2026 | 40 logged/billed, €2,400 invoiced, €0 received |
| `client_profitability` | c04, Jul 2026 | 40 logged/billed, €2,400 invoiced, €0 received |
| `client_profitability` | c04, Aug 2026 | 30 logged/billed, €1,800 invoiced/received |
| `subscription_usage` | sub02 | first €66.99, last €80.99, +20.9% |
| `subscription_usage` | sub05 | €29/month, 94 days since login, max 1 charge/month |
| `subscription_usage` | sub03 | €15/month, max 2 charges/month, €105 total |
| `ar_aging` | inv0031 | €2,400, due 2026-08-15, 47 days late, bucket `31-60` |
| `ar_aging` | inv0038 | €2,400, due 2026-08-29, 33 days late, bucket `31-60` |

Run the dataset sanity checks with:

```bash
python data/sanity_checks.py
```

## Person 5 — Leak Hunter

The findings file must be a JSON array of `Finding` objects, following `docs/contracts.md` §3.

Rules:

- Emit **one finding per leak story**.
- Aggregate Nordwind’s two unpaid invoices into one `late_payer` finding for `c04`.
- Aggregate Atlas’s August and September unbilled hours into one `unbilled_hours` finding for `c01` (22 hours total).

Once the API is live:

```bash
curl -s http://localhost:4000/api/findings > /tmp/findings.json
python evals/check_findings.py --findings /tmp/findings.json
```

The eval matches one-to-one on `(type, client_id, subscription_id)`. Extra or duplicate findings count as false alarms.

Current mock result:

```text
6/6 found, 0 false alarms
```

## Person 6 — Dashboard

The eval checks whether each leak was found, not whether every displayed amount is correct. Verify dashboard numbers against `data/answer_key.json` and `data/README.md` §8.

Numbers to check:

- Six leaks: **€1,918.00/month**
- Cash at risk: **€4,800.00**
- Closing cash: **€8,420.00**
- Invoice revenue: **€57,222.00**
- Cash receipts: **€52,422.00**
- Cash expenses: **€48,802.00**

`data/answer_key.json` is eval-only. It is never loaded into Postgres and never exposed through the API.

## Verification

```text
$ python data/sanity_checks.py
All 1256 checks passed.

$ python evals/check_findings.py --findings web/src/mock/findings.json
6/6 found, 0 false alarms
```

The `data-v1` tag points at commit `93e3af3`. If the dataset changes, create a new tag such as `data-v2` rather than moving `data-v1`.
