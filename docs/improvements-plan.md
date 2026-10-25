# Ledger Lens — Tier 1 + Tier 2 improvements (Mon Oct 26)

## Context
Core product works live (eval 6/6, 122 tests). Score now depends on what judges *see*: architecture proof, real actions, visible engines, generalization. These 8 features turn existing work into visible points. Must fit Monday before feature freeze; Tuesday = video + submission only.

## Ground rules
- **New API shapes locked at 09:30** (section "Contract v1.1" below). P1 adds them to `docs/contracts.md` + `web/src/types.ts`; everyone builds on mocks until real endpoint lands.
- One branch + one PR per feature (`feat/<n>-<name>`), tests included, P1 reviews.
- **18:00 cutoff:** feature not merged and working live → dropped, no exceptions. Then docs, fresh-clone test, freeze tag at 22:00.
- No new numbers from models: every EUR amount on screen comes from Zetaris rows (same grounding rule as Explainer/CFO).

## Timeline
| Time | What |
| --- | --- |
| 09:00 | 15-min call: confirm owners; P1 posts contract v1.1 |
| 09:30–13:00 | Build on mocks |
| 13:00 | First PRs merged (#1, #4, #5) |
| 13:00–16:00 | Remaining PRs; P6 switches each screen to real API as merged |
| 16:00–18:00 | Integration on Reda's machine, live run, eval, bug fixes |
| 18:00 | Cutoff |
| 18:00–22:00 | README, metadata.json, fresh-clone test (Monday plan), tag `v1.0-freeze` |

## Contract v1.1 (new endpoints and events)
```ts
// trace line (existing TraceLine in backend/src/traces.ts) + new event
{ event: 'llm_call', step, data: { model: string, ms: number, ok: boolean } }

GET  /api/runs/:id/trace      -> TraceLine[]
POST /api/moves/:id/draft     -> { move_id, kind: 'email'|'steps'|'invoice_lines', subject: string|null,
                                   body: string, ungrounded: number[] }   // ungrounded = numbers not found in evidence
GET  /api/entities/:id        -> { id, kind: 'client'|'subscription', name, summary: string,
                                   facts: Record<string, string|number>, findings: Finding[], invoices: object[] }
GET  /api/memories            -> { id, text, decision: 'approve'|'reject', action_type, created_at }[]
DELETE /api/memories/:id      -> 204
GET  /api/changes             -> { previous_run_id: string|null, new: Finding[], resolved: Finding[],
                                   changed: { finding_id, field, before: number, after: number }[] }
```
#5 headline and #8 stats are computed in the web from existing data: no new endpoint.

---

## Features

### #1 Live agent timeline — P1 backend, P6 UI
- **Backend (P1):** in `ctxFor` (`backend/src/agents/orchestrator.ts`) wrap `deps.llm.chat` so each call traces `llm_call {model, ms, ok}` — one place, all agents covered. Add `GET /api/runs/:id/trace` in `backend/src/server.ts` reading `logs/<run_id>.jsonl` (404 if missing, reuse `NotFoundError`). Add `ctx.trace('checks_done', {ran, failed})` in Leak Hunter and `memory_applied {count}` in CFO.
- **UI (P6):** in `web/src/components/RunModal.tsx` poll trace every 1 s with run status; render steps (Leak Hunter → Explainer → Forecaster → CFO) with sub-lines: "6 SQL checks on Zetaris", "Nemotron Lightning · 7.9 s", "Markovian · 3 chunks", "H-MEM · 1 memory applied", rejected calls in amber.
- **Tests:** orchestrator test asserts `llm_call` lines with model; routes test for trace endpoint.

### #2 Action drafts (shown, never sent) — P5 backend, P6 UI
- **Backend (P5):** new `prompts/action_draft.md`, new `backend/src/agents/drafter.ts`: input move + its cited findings (evidence rows) → draft. Kind by `action_type`: `send_reminder`→email, `cancel_subscription`/`dispute_charge`→steps, `bill_hours`/`raise_rate`→email or invoice_lines. Fast lane (default model). Grounding: extract every number from body; any not in the findings' impact/evidence rows → `ungrounded`; if any ungrounded, retry once, then deterministic template from evidence (invoice ids, amounts, days late). Reuse `extractJson` (`backend/src/agents/explainer.ts`) and `loadPrompt` (`backend/src/agents/prompts.ts`). Route `POST /api/moves/:id/draft` (P1 wires, 404 unknown move).
- **UI (P6):** "Draft" button on approved moves in `web/src/components/MoveCard.tsx` → modal with subject/body, Copy button, label "Never sent automatically".
- **Tests:** drafter with `scriptedLlm` (`backend/test/helpers.ts`): grounded reply passes; reply with invented amount → fallback template; offline → template.

### #3 Client 360 via World Model — P4 backend, P2 data, P6 UI
- **Data (P2):** today WM only ingests findings (`orchestrator.ts` passes `{ findings }`). Add `ENTITY_SQL` (client_profitability, subscription_usage, ar_aging full rows) next to `SQL_CHECKS` style; orchestrator runs them after Leak Hunter via `ctx.sql` and passes rows to `ingestZetarisData` (`backend/src/engines/worldModelAdapter.ts`, already accepts `clientProfitability`, `subscriptionUsage`, …). Confirm row columns match what the adapter reads.
- **Backend (P4):** `GET /api/entities/:id` using `getEntityContext` (`worldModelAdapter.ts:182`) mapped to contract shape; findings = latest findings with that client/subscription id. Trace `world_model_ingested {entities}` for the timeline.
- **UI (P6):** client/vendor names in `FindingCard` and `EvidenceDrawer` clickable → drawer: rate vs market, unbilled hours, overdue invoices, findings, button "What if I lose them?" → existing what-if (`lose_client`).
- **Tests:** adapter test: ingest P2 mock rows (`mockSql`) → entity `c01` has facts + findings; routes test 404 unknown id.

### #4 Persistent memory + "What I've learned" panel — P4 backend, P1 UI
- **Backend (P4):** `HMEM` already supports `persistDir` (`backend/src/engines/hmem/memoryStore.ts:47`): pass `persistDir: logs/hmem` in `createEngines` (`backend/src/engines/index.ts`), configurable for tests (temp dir). `GET /api/memories` lists decision memories (tag `decision`); `DELETE /api/memories/:id` — use the store's delete/archive if present, else mark via `feedback`, and filter archived out of `applyMemoriesToMoves`.
- **UI (P1, Claude Code):** panel on Brief page listing memories with Forget button.
- **Tests:** restart test: engines A records decision → engines B same dir sees it; forget → no longer changes ranking.

### #5 Money headline — P6
- Brief page banner from findings: sum `monthly_impact_eur` = "leaking/month", sum `cash_at_risk_eur` = "at risk", moves' `monthly_impact_eur` sum = "today's 3 moves recover". Replace hardcoded leaks badge `6` in `web/src/components/Navbar.tsx` with real count.
- P3 checks the three totals against `data/answer_key.json`.

### #6 Second persona (generalization proof) — P3 data, P2 Zetaris, P5 eval
- **Data (P3):** `data/generate.py --persona b` (different seed, clients, vendors, amounts, a different mix of the 6 leak types; amounts stay EUR because contract fields are `*_eur`) → `data/out/b/`, `data/answer_key_b.json`; `load_postgres.py --db ledger_lens_b`; `sanity_checks.py` passes for both.
- **Zetaris (P2):** `setup_zetaris.sh --persona b` registers `ledger_lens_pg_b` + views in second container; backend switches with existing `zetaris.viewSchema` config (env). Regenerate mocks for b (`zetaris/generate_mocks.py`).
- **Eval (P5):** run live on b with **no code or prompt change**: `python evals/check_findings.py --answer-key data/answer_key_b.json`. Result line goes in README: "Persona A 6/6, persona B N/N, 0 false alarms".
- Persona A stays the demo persona; b is proof only.

### #7 What changed since last run — P1
- Orchestrator saves each finished `RunResult` to `logs/runs/<run_id>.json`; keeps previous one. `GET /api/changes` diffs by `(type, client_id, subscription_id)` (same key as eval): new, resolved, changed amounts/days late. Also feed into `brief.what_changed` strings.
- UI (P6, small): strip above moves: "New: …  Resolved: …".
- **Tests:** two runs with different mock rows → expected diff.

### #8 Grounding stats chip — P1
- From trace (#1): "41 model calls · 3 rejected for unproven numbers · 0 failed". Shown in RunModal end state and Brief footer. Web only.

## Who does what
| Person | Tasks (in order) |
| --- | --- |
| **P1 Reda** | Contract v1.1 (09:30) → #1 backend → #7 → #4 UI → #8 → wire #2 route → integration 16:00 → reviews; Monday plan tasks after 18:00 |
| **P2** | #3 entity SQL + WM ingest rows → #6 Zetaris persona b (container, views, mocks) → README Zetaris screenshots |
| **P3** | #6 persona b dataset + answer key + sanity checks → number check of #5 and Client 360 on screen |
| **P4** | #4 memory persistence + endpoints → #3 entities endpoint + test |
| **P5** | #2 drafter + prompt + tests → #6 eval on persona b → stability runs (Monday plan) |
| **P6** | #5 headline (first, quick) → #1 timeline → #2 draft modal → #3 Client 360 drawer → #7 strip; 1920×1080 screenshots |

Drop order if late (last dropped first): #7 → #8 → #6 → #3 → #4. Keep #1, #2, #5 at any cost: they carry the video.

## Verification
- `npm test` + `npx tsc --noEmit` in `backend/`, `npm run build` in `web/` on each PR.
- 16:00 live run on Reda's machine (`ZETARIS_MOCK=0`): timeline shows all steps with Nemotron models; draft for Nordwind reminder contains only invoice ids/amounts from evidence; Client 360 for Atlas Co matches view rows; reject → restart backend → memory still applied; headline totals match answer key; `evals/check_findings.py` 6/6.
- Persona b eval N/N with zero code change.
- Video dry-run of the 3-minute story using these screens before 18:00.
