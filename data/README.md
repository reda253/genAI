# Ledger Lens — Synthetic dataset plan

**Status: locked v1.0 (Task 1)** · Owner: data engineer (P3) · Branch: `data-engineer`

This is the source of truth for the data layer. Everything in `infra/`, `data/`, `zetaris/views/`, and `evals/` derives from the facts below. Change it only after telling the group, and bump the version.

> **Scope of "mirroring the fixtures":** we mirror the six business facts (entity IDs, leak values, and `cash_today = 8,420.00`). We deliberately do **not** mirror the placeholder forecast, generated finding text, evidence IDs, or timestamps.

---

## 1. Persona

**Sara El Amrani**, 34, independent brand and UI designer based in Casablanca. She works for European startups and studios, invoices in **EUR**, and thinks about her personal money in **MAD**.

- Data window: **2026-04-01 → 2026-09-30**
- Demo "today": **2026-10-01**
- Accounting currency: **EUR**
- MAD is a **display-only** conversion through P2's `fx_rates` view. No database table has a currency column.
- P2's FX source must cover **2026-03-31 → 2026-10-01** so every transaction date, including the opening-balance row, can be converted.

---

## 2. Business snapshot

| Item | Target |
|---|---|
| Active clients | 9 |
| Active subscriptions | 10 |
| Billable hours | ~150–162 / month |
| Invoice revenue, normal month | **€9,337** |
| Invoice revenue, June and July | **€9,937** (Nordwind works 40h instead of 30h) |
| Total invoice revenue, 6 months | **€57,222.00** |
| Cash receipts, 6 months | **€52,422.00** (€4,800.00 unpaid at Sep 30) |
| Cash outflow | **~€8,134 / month** |
| Net cash | **~+€600 / month average** |
| Opening balance, 2026-03-31 | **€4,800.00** |
| Closing balance, 2026-09-30 | **€8,420.00 (hard target)** |
| Visible monthly leakage | **€1,918.00** |
| Cash at risk (late payer) | **€4,800.00** |

Cash reconciliation:

```text
€57,222.00 invoice revenue
−  €4,800.00 unpaid Nordwind invoices
= €52,422.00 cash receipts
− €48,802.00 cash expenses
=  €3,620.00 net cash
+  €4,800.00 opening balance
=  €8,420.00 closing balance
```

The generator may flex the **personal draw** month to month so that the closing balance lands exactly on €8,420.00. Every other number should stay in a believable range.

Target demo behaviour:

- Baseline cash never goes negative.
- Losing c01 Atlas Co (~€2,400/month of invoiced revenue) creates a runway of roughly **4–5 months** from €8,420.

---

## 3. Clients

Contract columns: `client_id`, `name`, `hourly_rate`, `market_rate`, `service`, `payment_terms_days`, `start_date`, `active`.

| client_id | name | service | hourly_rate | market_rate | payment_terms_days | start_date | active | Story role |
|---|---|---|---:|---:|---:|---|---|---|
| c01 | Atlas Co | branding | 60.00 | 65.00 | 30 | 2024-02-01 | true | Biggest client; **unbilled-hours leak** |
| c02 | Meridian Health | ui_design | 85.00 | 85.00 | 30 | 2024-06-15 | true | healthy |
| c03 | Stone & Finch | branding | 72.50 | 75.00 | 15 | 2025-01-10 | true | healthy; pays 8 days late |
| c04 | Nordwind Studio | illustration | 60.00 | 60.00 | 30 | 2024-09-01 | true | **late-payer leak** |
| c05 | Lumen Labs | ui_design | 90.00 | 95.00 | 30 | 2025-03-01 | true | healthy |
| c06 | Harbor & Co | branding | 68.00 | 70.00 | 45 | 2023-11-15 | true | healthy; pays 20 days late |
| c07 | Kestrel Books | illustration | 42.00 | 60.00 | 45 | 2024-04-01 | true | **underpriced-service leak** |
| c08 | Vela Coffee | branding | 65.00 | 65.00 | 15 | 2025-06-01 | true | healthy |
| c09 | Orbit Fitness | ui_design | 78.00 | 80.00 | 30 | 2025-09-01 | true | healthy |

All nine clients are active for the whole window.

### Work pattern

| Client | Monthly billable hours |
|---|---|
| c01 Atlas Co | 40h Apr–Jul; **52h Aug**; **50h Sep**. Invoice 40h every month |
| c02 Meridian Health | 15h |
| c03 Stone & Finch | 10h |
| c04 Nordwind Studio | 30h; **40h in Jun and Jul** |
| c05 Lumen Labs | 6h |
| c06 Harbor & Co | 8h |
| c07 Kestrel Books | 30h |
| c08 Vela Coffee | 5h |
| c09 Orbit Fitness | 6h |

Hours per month: 150h in a normal month; 162h in August; 160h in September; 160h in June/July.

### Invoiced revenue

Revenue is attributed to the **work month** — the month of the time logs the invoice covers — not the invoice issue date. This matters for Nordwind: both late invoices are issued in July but belong to June and July work.

| Month | Invoice revenue | Why |
|---|---:|---|
| Apr 2026 | €9,337 | normal pattern |
| May 2026 | €9,337 | normal pattern |
| Jun 2026 | €9,937 | Nordwind works 40h instead of 30h |
| Jul 2026 | €9,937 | Nordwind works 40h instead of 30h |
| Aug 2026 | €9,337 | Atlas invoices 40h of its 52h; Nordwind works 30h |
| Sep 2026 | €9,337 | Atlas invoices 40h of its 50h; Nordwind works 30h |
| **Total** | **€57,222** | |

Atlas's 12 unbilled hours in August and 10 in September are **not** invoiced, so they add no revenue.

---

## 4. Subscriptions

Contract columns: `subscription_id`, `vendor`, `plan`, `monthly_cost`, `billing_day`, `start_date`, `cancelled_date`, `last_login_date`.

| subscription_id | vendor | plan | monthly_cost | billing_day | start_date | cancelled_date | last_login_date |
|---|---|---|---:|---:|---|---|---|
| sub01 | Google Workspace | Business Standard | 12.00 | 2 | 2024-02-01 | null | 2026-09-30 |
| sub02 | Adobe | Creative Cloud All Apps | 80.99 | 5 | 2024-03-01 | null | 2026-09-29 |
| sub03 | Figma | Professional | 15.00 | 20 | 2024-05-01 | null | 2026-09-28 |
| sub04 | Dropbox | Plus | 11.99 | 10 | 2024-07-01 | null | 2026-09-20 |
| sub05 | Webflow | CMS | 29.00 | 12 | 2024-08-01 | null | 2026-06-29 |
| sub06 | Framer | Pro | 20.00 | 8 | 2025-01-01 | null | 2026-09-27 |
| sub07 | Vercel | Pro | 20.00 | 15 | 2025-02-01 | null | 2026-09-25 |
| sub08 | Notion | Plus | 10.00 | 18 | 2024-10-01 | null | 2026-09-15 |
| sub09 | Loom | Business | 12.50 | 22 | 2025-03-01 | null | 2026-08-25 |
| sub10 | Miro | Starter | 8.00 | 25 | 2025-05-01 | null | 2026-08-10 |

Total list price: **€219.48/month**. All subscriptions stay active for the whole window.

### Charge history

**Adobe (sub02) — price rise**

- April and May: **€66.99**
- June through September: **€80.99**
- First charge: €66.99 · last charge: €80.99 · change: **+20.9%**
- Monthly impact: **€14.00**

**Figma (sub03) — duplicate charge**

- One €15.00 charge per month, except **August**, which has two charges: **2026-08-20** and **2026-08-22**.
- `max_charges_in_a_month = 2` · total charged over the window: **€105.00**
- Monthly impact: **€15.00** (one-off)

**Webflow (sub05) — unused**

- Charged €29.00 every month from April through September.
- Last login: **2026-06-29** — **94 days** before the demo date.
- No `cancelled_date`; still being charged.
- Monthly impact: **€29.00**

All other subscriptions have one charge per month, no price change, and a last login under 60 days before 2026-10-01. The closest healthy case is Miro at 52 days.

---

## 5. Leak ledger — exactly six

| Type | Entity | How it is planted | Expected view signal | Answer-key impact |
|---|---|---|---|---|
| `unbilled_hours` | c01 Atlas Co | Apr–Jul: 40h logged / 40h invoiced. **Aug: 52h logged / 40h invoiced. Sep: 50h logged / 40h invoiced.** The extra billable logs have `invoice_id = NULL` | `client_profitability`: Aug unbilled 12h (23.08%), Sep unbilled 10h (20.00%) | **€1,320.00** (22h × €60) |
| `price_rise` | sub02 Adobe | €66.99 in Apr–May; €80.99 in Jun–Sep | `subscription_usage`: first 66.99, last 80.99, +20.9% | **€14.00/month** |
| `unused_subscription` | sub05 Webflow | Still charged €29/month; last login 2026-06-29; not cancelled | `subscription_usage`: days_since_login = 94 | **€29.00/month** |
| `late_payer` | c04 Nordwind Studio | Two unpaid invoices, €2,400 each (40h × €60): `inv0031` covers June work, issued 2026-07-16, due 2026-08-15; `inv0038` covers July work, issued 2026-07-30, due 2026-08-29 | `ar_aging`: days_late 47 and 33; bucket `31-60`; status `overdue` | **€0.00/month; €4,800.00 cash at risk** |
| `underpriced_service` | c07 Kestrel Books | Rate €42 vs €60 market; 30h/month | `client_profitability`: hourly_rate 42, market_rate 60, effective_rate 42 | **€540.00/month** (30h × €18 gap) |
| `duplicate_charge` | sub03 Figma | Two €15 charges in August | `subscription_usage`: max_charges_in_a_month = 2 | **€15.00** (one-off) |

**Total visible leakage: €1,918.00/month.** **Cash at risk: €4,800.00.**

### Healthy controls — do not accidentally create extra leaks

- Every other time log is billable and linked to an invoice: **0% unbilled**.
- Every other client's rate is **≥ 90% of market**:
  - c01: 92.3% · c02: 100% · c03: 96.7% · c04: 100% · c05: 94.7% · c06: 97.1% · c08: 100% · c09: 97.5%
- Every other subscription has **one charge per month**, **0–5% price change**, and a last login **under 60 days**.
- Every other invoice is paid on time, except:
  - one c03 invoice paid 8 days late (bucket `1-30`);
  - one c06 invoice paid 20 days late (bucket `1-30`).
  - All other invoices are paid on time.
- No other duplicate charges.

---

## 6. Cash and expense model

### Opening balance

One synthetic row dated **2026-03-31**:

- `amount = +4,800.00`
- `category = other`
- `counterparty = Opening balance`
- `description = Opening balance brought forward`

P2 includes this row in the running `balance` calculation but starts `cash_position` rows at 2026-04-01. This is the only row outside the data window.

### Monthly outflow

| Item | Amount/month | Category | Timing |
|---|---:|---|---|
| Personal draw | ~€4,958 (flex line) | personal | last day |
| Office rent | €850.00 | rent | 3rd |
| Tax reserve | €1,400.00 | tax | 15th |
| Subscriptions | €219.48 | subscription | each billing day |
| Health insurance | €180.00 | other | 7th |
| Accountant | €120.00 | other | 10th |
| Travel | ~€200.00 | travel | 1–2 trips/month |
| Software one-offs | ~€100.00 | software | varies |
| Bank fees | €6.00 | other | last day |
| Other | ~€100.00 | other | varies |

Cash expenses are **~€8,134/month**, or **€48,802** over six months. The generator flexes the **personal draw** so the September 30 close is exactly **€8,420.00**. It may also tune travel/one-offs, but must keep them believable.

### Cash rules

- The running balance must **never be negative**, including the day the tax reserve leaves.
- Client payments are the only inflows.
- Every paid invoice has exactly one matching `client_payment` transaction with the same amount and date.
- An invoice marked `paid` has a `paid_date`; an unpaid invoice past its due date is `overdue`; an unpaid invoice not yet due is `sent`.
- **Healthy clients pay on issue (same day)**, so their `revenue_received` equals `revenue_invoiced` in the work month. c03 and c06 each have one earlier invoice paid 8 and 20 days late.
- **All non-Nordwind invoices are paid by 2026-09-30.** The only unpaid invoices at that date are **inv0031** and **inv0038** (Nordwind, €4,800 total); they are the source of the cash-at-risk number.
- September invoices from healthy clients are paid on issue so the six-month cash reconciliation holds.

---

## 7. Answer key preview

`data/answer_key.json` will contain exactly these six entries:

| type | client_id | subscription_id | monthly_impact_eur | note |
|---|---|---|---:|---|
| `unbilled_hours` | c01 | null | 1320.00 | 22h (12 Aug + 10 Sep) × €60; Atlas Co |
| `price_rise` | null | sub02 | 14.00 | Adobe €66.99 → €80.99 (+20.9%) |
| `unused_subscription` | null | sub05 | 29.00 | Webflow last login 2026-06-29 (94 days) |
| `late_payer` | c04 | null | 0.00 | inv0031 €2,400 47d late; inv0038 €2,400 33d late; €4,800 cash at risk |
| `underpriced_service` | c07 | null | 540.00 | Kestrel €42 vs €60 market; 30h/month |
| `duplicate_charge` | null | sub03 | 15.00 | Figma twice in August |

Notes:

- The late-payer answer key is **one entry per client**, not per invoice. P5 must aggregate both Nordwind invoices into one finding.
- P5 must emit **one finding per leak story**. Atlas's August and September unbilled hours are one 22-hour finding.
- `data/answer_key.json` is committed but **never loaded into Postgres and never exposed through the API**.

---

## 8. Contract semantics and integration notes

These are the decisions that P2 and P5 must follow. If one requires a contract change, raise it with P1 instead of editing `docs/contracts.md` locally.

1. `hours_logged` counts **billable** time logs only. Non-billable admin time, if generated, is excluded from `client_profitability`.
2. `hours_billed` counts time logs in that month with a non-null `invoice_id`.
3. `revenue_invoiced` is attributed to the **work month** — the month of the time logs linked to the invoice — not the invoice issue date. `revenue_received` is attributed to the **payment date month**. This keeps June and July profitable even though both Nordwind invoices were issued in July.
4. Monthly invoices are issued on the **last day of the month**, except Nordwind's two late invoices (issued 2026-07-16 and 2026-07-30, covering June and July work). **No invoice covers multiple months.**
5. Views must use the fixed demo date **`2026-10-01`**, never `CURRENT_DATE`. Otherwise days-late and days-since-login drift.
6. The opening-balance row (2026-03-31) is included in the running balance but excluded from the Apr–Sep `cash_position` rows.
7. Money is EUR everywhere. MAD appears only in the FX display conversion. Never add a `currency` column.
8. There is **no receipts table** in v0.1. Do not invent one.
9. The answer key is not an input to the agents. It exists only for `evals/`.
10. The four views keep the exact names and columns in `docs/contracts.md` §2: `client_profitability`, `cash_position`, `subscription_usage`, `ar_aging`.

### Expected view values for the six leaks

| View | Entity | Expected rows |
|---|---|---|
| `client_profitability` | c01, 2026-08-01 | hours_logged 52, hours_billed 40, unbilled_hours 12, unbilled_pct 23.08, hourly_rate 60, market_rate 65, revenue_invoiced 2400 |
| `client_profitability` | c01, 2026-09-01 | hours_logged 50, hours_billed 40, unbilled_hours 10, unbilled_pct 20.00, hourly_rate 60, market_rate 65, revenue_invoiced 2400 |
| `client_profitability` | c07, 2026-09-01 | hours_logged 30, hours_billed 30, hourly_rate 42, market_rate 60, revenue_invoiced 1260 |
| `client_profitability` | c04, 2026-06-01 | hours_logged 40, hours_billed 40, hourly_rate 60, revenue_invoiced 2400, revenue_received 0 |
| `client_profitability` | c04, 2026-07-01 | hours_logged 40, hours_billed 40, hourly_rate 60, revenue_invoiced 2400, revenue_received 0 |
| `client_profitability` | c04, 2026-08-01 | hours_logged 30, hours_billed 30, hourly_rate 60, revenue_invoiced 1800, revenue_received 1800 |
| `subscription_usage` | sub02 | first_charge_amount 66.99, last_charge_amount 80.99, price_change_pct 20.9, monthly_cost 80.99 |
| `subscription_usage` | sub05 | monthly_cost 29, days_since_login 94, max_charges_in_a_month 1 |
| `subscription_usage` | sub03 | monthly_cost 15, max_charges_in_a_month 2, total_charged 105 |
| `ar_aging` | inv0031 | amount 2400, due_date 2026-08-15, paid_date null, days_late 47, bucket `31-60`, status overdue |
| `ar_aging` | inv0038 | amount 2400, due_date 2026-08-29, paid_date null, days_late 33, bucket `31-60`, status overdue |

---

## 9. Determinism and regeneration

- Fixed seed: **20261001**.
- No `now()`, no system time, no unseeded randomness.
- Names and all leak values are hardcoded. Faker is optional for descriptions; it must never drive amounts, dates, or IDs.
- Money is generated as **integer cents** or `Decimal`; converted to `numeric(10,2)` for Postgres and 2-decimal numbers for JSON.
- CSV rows are sorted by date and ID before writing.
- Generated files (gitignored): `data/out/*.csv`, `data/out/summary.json`.
- Committed files: `data/README.md`, `data/answer_key.json`, `data/requirements.txt`, `data/schema.sql`, `data/generate.py`, `data/load_postgres.py`, `data/sanity_checks.py`, `evals/check_findings.py`.

### Target workflow

These files will exist after the next tasks:

```bash
cp .env.example .env          # fill POSTGRES_PASSWORD
docker compose -f infra/docker-compose.yml up -d
python data/generate.py       # writes data/out/*.csv, data/out/summary.json, data/answer_key.json
python data/load_postgres.py  # creates/recreates the 5 tables and loads the CSVs
python data/sanity_checks.py  # invariants + leak/negative-control checks
```

A second `generate.py` run must produce byte-identical CSVs and answer key:

```bash
python data/generate.py && sha256sum data/out/*.csv data/answer_key.json > /tmp/run-a
python data/generate.py && sha256sum data/out/*.csv data/answer_key.json > /tmp/run-b
diff /tmp/run-a /tmp/run-b
```

---

## 10. Definition of done for the dataset

- [ ] `docker compose -f infra/docker-compose.yml up -d` gives a healthy Postgres on port 5433.
- [ ] `python data/load_postgres.py` creates the five contract tables and loads every row.
- [ ] Regenerating produces identical hashes.
- [ ] 9 clients, 10 subscriptions, 54 invoices, 150–162 billable hours/month.
- [ ] Exactly six leaks cross P5's thresholds; no healthy entity does.
- [ ] Every invoice reconciles: `amount = hours_billed × hourly_rate`, correct due date, matching payment if paid.
- [ ] Every paid invoice has exactly one matching bank payment; the only unpaid invoices are inv0031 and inv0038.
- [ ] Invoice revenue totals €57,222.00; cash receipts €52,422.00; cash expenses €48,802.00; closing cash €8,420.00.
- [ ] Adobe, Webflow, Figma, and Kestrel histories match section 4 exactly.
- [ ] Balance is never negative and ends at **€8,420.00** on 2026-09-30.
- [ ] `data/answer_key.json` has exactly six entries with the values in section 7.
- [ ] `python data/sanity_checks.py` exits 0.
- [ ] With the backend running and one run finished (`POST /api/runs`), `python evals/check_findings.py` prints **6/6 found, 0 false alarms**. It reads the real findings from `http://localhost:4000/api/findings` by default; `--findings <file or URL>` overrides that. (`web/src/mock/findings.json` is a fixture, so checking it does not test the agents.)
- [ ] P2 can connect Zetaris to the database and reproduce the expected view values.
- [ ] `git tag data-v1` after Sunday's freeze.

---

## 11. Out of scope for Task 1

This document does **not** create or change:

- `infra/docker-compose.yml`
- `data/schema.sql`
- `data/generate.py`
- `data/load_postgres.py`
- `data/sanity_checks.py`
- `evals/check_findings.py`
- `backend/`, `web/`, `zetaris/views/`, or `prompts/`

P2 owns the Zetaris views; P5 owns the agent logic and prompts; P6 owns the dashboard; P1 owns the root README and `docs/contracts.md`.

---

## 12. Sources, provenance, and Zetaris registration (P2 + P3)

### Synthetic data

All five tables are synthetic. They are generated by `data/generate.py`; no
production, bank, client, or personal data is used. The generator uses the
fixed seed **20261001**, the fixed data window **2026-04-01 → 2026-09-30**, and
the fixed demo date **2026-10-01**. It does not use `now()`, system time, or
unseeded randomness. Names, amounts, dates, IDs, and leak values are
deterministic; a second run produces byte-identical CSVs and
`data/answer_key.json` (see section 9).

Generated files are gitignored under `data/out/`. The committed dataset files
are `data/README.md`, `data/answer_key.json`, `data/requirements.txt`,
`data/schema.sql`, `data/generate.py`, `data/load_postgres.py`,
`data/sanity_checks.py`, and `evals/check_findings.py`.

`data/answer_key.json` is eval-only. It is never loaded into Postgres and never
exposed through the API.

### Record counts and totals

| Table | Rows |
|---|---:|
| `clients` | 9 |
| `subscriptions` | 10 |
| `invoices` | 54 |
| `time_logs` | 132 |
| `bank_transactions` | 168 |

The dataset contains **942 billable hours** across the six-month window.

| Measure | EUR |
|---|---:|
| Invoice revenue | 57,222.00 |
| Cash receipts | 52,422.00 |
| Cash expenses | 48,802.00 |
| Opening balance | 4,800.00 |
| Closing balance | 8,420.00 |
| Unpaid invoices at 2026-09-30 | 4,800.00 |

These values are also written to `data/out/summary.json` by the generator.

### How the data is registered in Zetaris

`./zetaris/setup_zetaris.sh` is the one-command setup. It:

1. creates the synthetic Postgres source `ledger_lens_pg` (`CREATE DATASOURCE`,
   PostgreSQL JDBC) and imports the five tables;
2. creates the `ledger_lens` SchemaStore container;
3. creates the four contract views: `client_profitability`, `cash_position`,
   `subscription_usage`, and `ar_aging`;
4. registers the public REST source `fx_rest`, including the
   `fx_rest.eur_reference` table, and creates the display-only `fx_rates` view;
5. verifies the expected numbers from section 8 and prints `PASS`/`FAIL`.

Use `./zetaris/setup_zetaris.sh --dry-run` to preview the SQL without calling
Zetaris, or `--verify-only` to re-run the number checks. The setup needs a
running Zetaris instance and `ZETARIS_API_KEY` in `.env`.

The host is the machine as seen **from inside the Zetaris containers**, not the
host's `localhost`:

- Docker Desktop (Windows/WSL/macOS): `host.docker.internal`
- Linux native: the docker0/bridge IP or the LAN IP; set `ZETARIS_PG_HOST` if
  auto-detection is wrong
- Port: the host-published **5433**, not the container's 5432

See [zetaris/README.md](../zetaris/README.md) for the full registration and
troubleshooting details. The view/column catalog is
[`zetaris/catalog.json`](../zetaris/catalog.json).

### FX source and licence

MAD is display-only. The source is
[currency-api](https://github.com/fawazahmed0/exchange-api) by fawazahmed0,
served through jsDelivr. The upstream licence is **CC0 1.0**
([licence](https://github.com/fawazahmed0/exchange-api/blob/main/LICENSE)).

The default endpoint is:

```text
https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-10-01/v1/currencies/eur.json
```

The free endpoint returns one reference-date snapshot, not a daily history.
`fx_rates` repeats that rate for every date from **2026-03-31 → 2026-10-01** so
the UI can convert any transaction date. The rate is not stored in Postgres,
and no database table has a currency column.

### How to regenerate

```bash
docker compose -f infra/docker-compose.yml up -d
python data/generate.py
python data/load_postgres.py
python data/sanity_checks.py
```

The full-stack alternative is:

```bash
docker compose up -d --build
```

The seed container runs the same generator and loader. To confirm
determinism, use the byte-identical hash check in section 9, or:

```bash
python data/generate.py && sha256sum data/out/*.csv data/answer_key.json > /tmp/run-a
python data/generate.py && sha256sum data/out/*.csv data/answer_key.json > /tmp/run-b
diff /tmp/run-a /tmp/run-b
```

### Mock views (no Zetaris)

`backend/src/zetaris/mock/*.json` mirrors the four views and is generated from
the same CSVs:

```bash
python data/generate.py
python zetaris/generate_mocks.py             # persona A
python zetaris/generate_mocks.py --persona b # persona B, when P3 has generated data/out/b
```

With `ZETARIS_MOCK=1`, the backend reads those fixtures; with `ZETARIS_MOCK=0`,
it calls Zetaris through `backend/src/zetaris/client.ts` (SELECT only).

### Limitations

- The dataset is small and synthetic. It is suitable for the demo, not for
  statistical claims or real financial advice.
- There are no bank, invoicing, or time-tracker connectors, and no receipts
  table. Real use would need those integrations.
- The model is intentionally simplified: healthy clients pay on invoice day,
  monthly invoices are issued on the last day of the month, personal draws are
  posted at month-end, and time logs are 8-hour blocks on selected days rather
  than a daily timesheet.
- v1 has no non-billable admin time. If added later, section 8 requires it to be
  excluded from `client_profitability`.
- There are no partial payments, credits, VAT calculations, or multi-currency
  invoices. The tax reserve is a single monthly cash outflow.
- The FX view uses one reference rate repeated across the window. It is not
  historical daily data, and it depends on the public API being reachable at
  setup time.
- `ZETARIS_MOCK=1` uses committed fixtures for local and demo runs; it is not a
  live Zetaris query. The default Docker setup uses mock mode unless
  `ZETARIS_MOCK=0` is set.
- The demo date is fixed at **2026-10-01**; views never use `CURRENT_DATE`.
- The dataset is frozen at `data-v1`. Changing it requires a new version, a new
  tag, and notification to P2, P5, and P6.
