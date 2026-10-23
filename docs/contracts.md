# Contracts

**Status: DRAFT v0.1. Review together Fri Oct 23.** Once agreed, change a contract only after telling everyone in the group chat, and bump the version here.

Everyone builds mocks in exactly these shapes. If your real code can't produce a field, raise it in the chat. Don't rename it quietly.

## 0. Conventions (all)

- **Money:** EUR, JSON `number` with 2 decimals (`1250.50`). Bank amounts are signed: `+` money in, `-` money out. Impacts are always positive numbers.
- **Dates:** `YYYY-MM-DD`. Timestamps: ISO 8601 UTC (`2026-10-23T08:00:00Z`). Months: first day of month (`2026-09-01`).
- **IDs:** strings with prefixes: `c01` client, `inv0001` invoice, `tl00001` time log, `tx00001` transaction, `sub01` subscription, `f001` finding, `m001` move, `run_...` run.
- **Naming:** `snake_case` in SQL **and** JSON (the API passes rows through unchanged).
- **Data window:** 2026-04-01 to 2026-09-30. "Today" for the demo is **2026-10-01**.

## 1. Data schema: Postgres (P3)

Database `ledger_lens` on port 5433 (see `.env.example`).

### `clients`
| column | type | notes |
| --- | --- | --- |
| client_id | text PK | `c01`…`c09` |
| name | text | invented company name |
| hourly_rate | numeric(10,2) | agreed rate, EUR/h |
| market_rate | numeric(10,2) | typical rate for this service (for "underpriced") |
| service | text | e.g. `branding`, `ui_design`, `illustration` |
| payment_terms_days | int | 15 / 30 / 45 |
| start_date | date | |
| active | boolean | |

### `time_logs`
| column | type | notes |
| --- | --- | --- |
| log_id | text PK | |
| client_id | text FK → clients | |
| date | date | |
| hours | numeric(5,2) | |
| billable | boolean | |
| invoice_id | text FK → invoices, nullable | `NULL` + `billable = true` = unbilled hours |
| description | text | |

### `invoices`
| column | type | notes |
| --- | --- | --- |
| invoice_id | text PK | |
| client_id | text FK → clients | |
| issue_date | date | |
| due_date | date | issue_date + payment_terms_days |
| paid_date | date, nullable | `NULL` = unpaid |
| hours_billed | numeric(6,2) | |
| amount | numeric(10,2) | normally hours_billed × hourly_rate |
| status | text | `sent` \| `paid` \| `overdue` |

### `bank_transactions`
| column | type | notes |
| --- | --- | --- |
| txn_id | text PK | |
| date | date | |
| amount | numeric(10,2) | signed |
| counterparty | text | client or vendor name as it appears on the statement |
| category | text | `client_payment` \| `subscription` \| `software` \| `rent` \| `tax` \| `travel` \| `personal` \| `other` |
| invoice_id | text FK, nullable | set for client payments |
| subscription_id | text FK, nullable | set for subscription charges |
| description | text | raw statement text |

### `subscriptions`
| column | type | notes |
| --- | --- | --- |
| subscription_id | text PK | |
| vendor | text | |
| plan | text | |
| monthly_cost | numeric(10,2) | **current** list price (the bank shows the history) |
| billing_day | int | 1-28 |
| start_date | date | |
| cancelled_date | date, nullable | |
| last_login_date | date, nullable | for "unused subscription" |

### REST source: exchange rates (P2)
Public FX API registered in Zetaris as `fx_rates(date date, base text, quote text, rate numeric)`, used to show amounts in MAD as well as EUR.

### Planted leaks (P3 → `data/answer_key.json`)
| type | where it shows |
| --- | --- |
| `unbilled_hours` | `time_logs` billable with no invoice |
| `price_rise` | same subscription charged more in later months |
| `unused_subscription` | `last_login_date` > 60 days ago, still charged |
| `late_payer` | invoices paid > 30 days after `due_date`, or still unpaid |
| `underpriced_service` | `hourly_rate` well below `market_rate` |
| `duplicate_charge` | same vendor, same amount, twice in one month |

`answer_key.json`: `[{ "type": "...", "client_id": "c03" | null, "subscription_id": "sub04" | null, "monthly_impact_eur": 0.00, "note": "..." }]`

## 2. Zetaris views (P2)

Agents read **only** these views, through `querySql(sql)`. View names are fixed; columns are below.

### `client_profitability`: one row per client per month
| column | type |
| --- | --- |
| client_id, client_name | text |
| month | date |
| hours_logged | numeric |
| hours_billed | numeric |
| unbilled_hours | numeric |
| unbilled_pct | numeric (0-100) |
| hourly_rate | numeric |
| market_rate | numeric |
| effective_rate | numeric (revenue_invoiced / hours_logged) |
| revenue_invoiced | numeric |
| revenue_received | numeric |

### `cash_position`: one row per day
| column | type |
| --- | --- |
| date | date |
| inflow | numeric (≥ 0) |
| outflow | numeric (≥ 0) |
| net | numeric |
| balance | numeric (end of day) |

### `subscription_usage`: one row per subscription
| column | type |
| --- | --- |
| subscription_id, vendor, plan | text |
| monthly_cost | numeric (current) |
| first_charge_amount | numeric |
| last_charge_amount | numeric |
| price_change_pct | numeric |
| last_login_date | date |
| days_since_login | int (vs 2026-10-01) |
| max_charges_in_a_month | int (> 1 = duplicate) |
| total_charged | numeric (whole window) |

### `ar_aging`: one row per invoice
| column | type |
| --- | --- |
| invoice_id, client_id, client_name | text |
| amount | numeric |
| issue_date, due_date | date |
| paid_date | date, nullable |
| days_late | int (paid_date or 2026-10-01, minus due_date; 0 if on time) |
| bucket | text: `on_time` \| `1-30` \| `31-60` \| `61-90` \| `90+` |
| status | text |

### Zetaris client (P2): `backend/src/zetaris/client.ts`
```ts
querySql(sql: string): Promise<{ rows: Record<string, unknown>[]; sql: string; ranAt: string }>
// SELECT only; throws on anything else. ZETARIS_MOCK=1 → rows from backend/src/zetaris/mock/<view>.json
```

## 3. Agent output JSON (P5)

TypeScript types live in `backend/src/agents/types.ts` (P1 creates it from this section). Web copies them.

### Evidence
Every claim carries the query and rows it came from. No number may appear in a claim unless it is in `rows`.
```json
{
  "id": "e001",
  "view": "ar_aging",
  "sql": "SELECT invoice_id, amount, days_late FROM ar_aging WHERE client_id = 'c04' AND days_late > 30",
  "rows": [{ "invoice_id": "inv0031", "amount": 2400.00, "days_late": 47 }],
  "ran_at": "2026-10-01T08:00:02Z"
}
```

### Finding (Leak Hunter)
```json
{
  "id": "f001",
  "type": "late_payer",
  "title": "Nordwind Studio pays 47 days late on average",
  "client_id": "c04",
  "subscription_id": null,
  "monthly_impact_eur": 0.00,
  "cash_at_risk_eur": 4800.00,
  "confidence": "high",
  "evidence": [ /* Evidence */ ],
  "detected_at": "2026-10-01T08:00:05Z"
}
```
- `type`: one of the 6 leak types in section 1.
- `confidence`: `high` \| `medium` \| `low`. Use `low` when the data can't fully support the claim.
- `monthly_impact_eur`: money lost per month. `cash_at_risk_eur`: money owed but not yet received (late payer), else `0`.

### Explanation (Explainer)
```json
{
  "question": "Why did my margin drop in September?",
  "summary": "Margin fell 18% mainly because 22 hours for Atlas Co were never invoiced.",
  "causes": [
    { "rank": 1, "cause": "22 unbilled hours for Atlas Co", "amount_eur": 1320.00, "finding_id": "f002", "evidence": [ /* Evidence */ ] }
  ],
  "uncertain": false,
  "uncertainty_note": null
}
```

### Forecast (Forecaster, math in `forecast_math.ts`)
```json
{
  "scenario": { "type": "baseline" },
  "start_balance": 8420.00,
  "months": [
    { "month": "2026-10-01", "inflow": 6200.00, "outflow": 4100.00, "balance": 10520.00 }
  ],
  "min_balance": 7300.00,
  "runway_months": null
}
```
- `scenario.type`: `baseline` \| `lose_client` (`client_id`) \| `raise_prices` (`pct`, e.g. `10`).
- `months`: always 6 entries, Oct 2026 to Mar 2027.
- `runway_months`: months until balance < 0; `null` if it never goes negative within the 6 months.

### Move (CFO)
```json
{
  "id": "m001",
  "rank": 1,
  "title": "Invoice Atlas Co for 22 unbilled hours",
  "action_type": "bill_hours",
  "monthly_impact_eur": 1320.00,
  "urgency": "high",
  "reason": "Hours from August and September were logged but never invoiced.",
  "finding_ids": ["f002"],
  "memory_note": null,
  "status": "pending"
}
```
- `action_type`: `bill_hours` \| `send_reminder` \| `cancel_subscription` \| `dispute_charge` \| `raise_rate`.
- `urgency`: `high` \| `medium` \| `low`.
- `memory_note`: set when H-MEM changed the ranking, e.g. `"You rejected cancelling Figma last week, so it is ranked lower."`
- `status`: `pending` \| `approved` \| `rejected`.

### Brief (CFO output for the morning-brief screen)
```json
{
  "run_id": "run_20261001_080000",
  "generated_at": "2026-10-01T08:00:30Z",
  "cash_today": 8420.00,
  "what_changed": ["Adobe price rose 21% since April", "Invoice inv0031 is now 47 days late"],
  "moves": [ /* exactly 3 Move */ ],
  "findings_count": 6
}
```

## 4. API endpoints (P1)

Fastify on `http://localhost:3000` (`PORT`, web uses `VITE_API_URL`). All JSON. Errors: `{ "error": { "code": "not_found", "message": "..." } }` with a matching HTTP status.

Agent runs take a while, so a run starts async and the web polls for it.

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/health` | | `{ "ok": true, "zetaris": true, "nightshift": true }` |
| POST | `/api/runs` | | `{ "run_id": "...", "status": "running" }` |
| GET | `/api/runs/:run_id` | | `{ "run_id", "status": "running" \| "done" \| "failed", "step": "leak_hunter" \| "explainer" \| "forecaster" \| "cfo" \| null, "error": null }` |
| GET | `/api/brief` | | Brief (latest finished run) |
| GET | `/api/findings` | | `Finding[]` |
| GET | `/api/findings/:id` | | Finding |
| POST | `/api/explain` | `{ "question": "...", "finding_id": "f002" \| null }` | Explanation |
| GET | `/api/forecast` | | Forecast (baseline) |
| POST | `/api/forecast/what-if` | `{ "type": "lose_client", "client_id": "c01" }` or `{ "type": "raise_prices", "pct": 10 }` | `{ "baseline": Forecast, "scenario": Forecast }` |
| POST | `/api/moves/:id/decision` | `{ "decision": "approve" \| "reject", "note": "..." \| null }` | Move (updated `status`); stored in H-MEM |

Before the first run finishes, `GET /api/brief`, `/api/findings` and `/api/forecast` return `404` with code `no_run_yet`.

### Mock files
Name mocks after what they mock, so switching to real data is a one-line change:
- `backend/src/zetaris/mock/<view_name>.json`: array of view rows (P2)
- `web/src/mock/brief.json`, `findings.json`, `explanation.json`, `forecast.json`, `what_if.json`: API responses (P6)
