# Sponsor technology in Ledger Lens

Ledger Lens is an AI finance team for a freelancer. It finds where her money leaks, explains why with evidence, simulates what-ifs, and drafts the fix, which she approves or rejects. Every number comes from Zetaris, every model call goes through Meterless Nightshift to NVIDIA Nemotron, and three Meterless engines carry the reasoning and memory.

Track: **03 · Reasoning Architecture**. Repo: <https://github.com/reda253/genAI>

## Zetaris: the only data path

- **Two sources, one federated layer.** `ledger_lens_pg` (Postgres: clients, invoices, time logs, subscriptions, bank transactions) and `fx_rest` (a public EUR/MAD REST source, currency-api, CC0-1.0) are registered in Zetaris and joined into **four views**: `client_profitability`, `cash_position`, `subscription_usage`, `ar_aging`.
- **Agents never touch raw tables.** The backend has one read path, `querySql` in [`backend/src/zetaris/client.ts`](../backend/src/zetaris/client.ts). It calls Zetaris's SQL API and rejects anything that is not a `SELECT`.
- **Evidence on every claim.** Each finding stores the exact SQL it ran on a view and the rows it got back. The dashboard shows both in one click.
- **One-command setup with a check.** [`zetaris/setup_zetaris.sh`](../zetaris/setup_zetaris.sh) registers both sources, creates the views and verifies the expected numbers. It also has `--dry-run` and `--verify-only`.
- **Works without Zetaris too.** `ZETARIS_MOCK=1` reads committed fixtures generated from the same data, so anyone can run the demo. Live and mock give the same six findings.

## Meterless Nightshift: the AI provider

- Every model call goes through Nightshift's OpenAI-compatible runtime (`http://127.0.0.1:8088/v1`). See [`backend/src/llm/nightshift.ts`](../backend/src/llm/nightshift.ts).
- The token comes from `METERLESS_RUNTIME_TOKEN`, or from Nightshift's own state folder when that is empty. Calls carry `meterless-app: ledger-lens`. If the configured port is offline, the backend probes the usual ports (Auto Detect).
- The health check reads `/v1/models`. The dashboard shows a live Nightshift status dot.
- Each call is traced with its model, duration and outcome (`llm_call`). The run timeline in the UI shows them live.

## Meterless engines: memory and reasoning

The three reference engines run inside the backend. We built the adapters and the integration into the agents.

| Engine | What it does in Ledger Lens | Where | Tests |
|---|---|---|---|
| **World Model** | Each run ingests the findings and the full view rows (79 entities: clients, subscriptions, invoices). It powers the Client 360 drawer: facts, findings and invoices for one client, with a "simulate losing this client" button. | `worldModelAdapter.ts`, `GET /api/entities/:id` | 10 conformance + Client 360 integration tests |
| **H-MEM** | Remembers Sara's approve/reject decisions across runs and restarts. The CFO re-ranks the next brief with a visible memory note; "Forget" removes a memory and its effect. | `hmemAdapter.ts`, `GET/DELETE /api/memories` | 10 conformance + persistence and forget tests |
| **Markovian Thinking** | Gives the Explainer a bounded, step-by-step investigation. Evidence is carried from chunk to chunk, and the final answer is checked against the findings. | `markovianAdapter.ts` | 10 conformance tests |

Adapters and live memory moment: **44/44** integration tests. Details: [`docs/engine-tests.md`](engine-tests.md).

## NVIDIA Nemotron: where it contributes

| Model | Used by | Job |
|---|---|---|
| `nvidia/nemotron-3.5-lightning-30b-a3b` (fast lane) | Leak Hunter, Markovian compressor | Ranks and describes the six findings that the SQL checks found; compresses Markovian chunks |
| `nvidia/nemotron-3-ultra-550b-a55b` (deep lane) | Explainer, CFO, critic revisions, action drafter | Explains causes with cited amounts; ranks the three moves; revises answers the critic rejects; drafts reminder emails, checklists and invoice lines |

Nemotron does the language and the judgment. It never makes up numbers:
- **Grounding.** A model may only cite amounts that appear in the finding or its evidence rows.
- **Critic loop.** An answer with an amount outside the evidence goes back to Nemotron once, with the allowed amounts. If it is still wrong, a deterministic fallback is used.
- **Confidence branch.** Findings below high confidence get an extra Explainer check before the CFO ranks them.
- **Code does the math.** Cash forecasts and what-ifs are computed in TypeScript.

## What is unique

- **A decision, not a summary.** The chain is: Zetaris views → evidence → grounded Nemotron output → deterministic math → a human decision → H-MEM memory that changes the next run.
- **Checkable.** An answer key with six planted leaks:
  - live eval: **6/6 found, 0 false alarms**
  - stability: **5/5 live runs** with the same findings and moves, and 0 failed model calls
  - 165 backend tests
- **Visible reasoning.** The run timeline shows every agent step with its Nemotron model and timing, plus the engines, the critic and the memory as they happen. For the demo, `DEMO_CRITIC=1` plants one invented amount, so the critic can be seen catching it. The timeline labels it as injected.
- **Human in the loop.** Nothing is sent: drafts are marked "Never sent automatically", and every move waits for approval.
- **Honest fallback.** Without Nightshift, the same six leaks and numbers still come out, with fixed wording.

## Pre-existing components

| Component | Licence | What we built on top |
|---|---|---|
| Meterless engine reference implementations (World Model, H-MEM, Markovian Thinking), in `backend/src/engines/world-model/`, `hmem/`, `markovian/`, from <https://github.com/Meterless/Meterless> | Apache-2.0 | The adapters (`backend/src/engines/*Adapter.ts`) and their integration into the agents, API and UI |

Everything else was built during the hackathon: the agents, API, dashboard, Zetaris views and setup, synthetic dataset and evals. Declared in [`metadata.json`](../metadata.json) (`pre_existing`).
