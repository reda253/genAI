# Architecture

Ledger Lens is an AI finance team for one freelancer, Sara. Agents find where her money leaks, explain why with the rows that prove it, simulate what-ifs, and rank today's moves. Nothing happens until she approves.

Three rules shape the design:

- **Agents never touch raw data.** Every number comes from a Zetaris view, through one SELECT-only client.
- **Every model call goes through Meterless Nightshift,** which routes it to NVIDIA Nemotron.
- **Every claim carries its evidence:** the SQL and the rows it came from. Every run is logged step by step.

## Layers

```
 DATA                         BUILD (backend, TypeScript)                          POWER
┌──────────────────┐   SQL   ┌──────────────────────────────────────────┐  HTTP  ┌──────────────────────┐
│ Postgres (5433)  │         │ Orchestrator                             │        │ Meterless Nightshift │
│  clients         │         │  1 Leak Hunter ──┐                       │        │  127.0.0.1:8088/v1   │
│  invoices        ├──┐      │  2 Explainer ────┤ Meterless engines     │ ─────► │  lane fast: Nemotron │
│  time_logs       │  │      │  3 Forecaster ───┤  World Model (state)  │        │   3.5 Lightning 30B  │
│  bank_txns       │  ▼      │  4 CFO ──────────┘  H-MEM (decisions)    │ ◄───── │  lane deep: Nemotron │
│  subscriptions   │ Zetaris │                     Markovian (Explainer)│        │   3 Ultra 550B       │
├──────────────────┤ 4 views │ querySql() ◄── Zetaris REST :8888        │        └──────────────────────┘
│ FX rates (REST)  ├──┘      │ traces → logs/<run_id>.jsonl             │
└──────────────────┘         └──────────────────┬───────────────────────┘
                                                │ JSON API :4000
                                       ┌────────▼─────────┐
                                       │ React dashboard  │  approve / reject
                                       │ (Vite :5173)     │ ─────────────────► H-MEM
                                       └──────────────────┘
```

| Layer | What | Where |
| --- | --- | --- |
| Data | Postgres with 6 months of synthetic data and 5-6 planted leaks, plus an exchange-rate REST source, registered in Zetaris | `infra/`, `data/`, `zetaris/` |
| Semantic layer | 4 Zetaris views: `client_profitability`, `cash_position`, `subscription_usage`, `ar_aging` | `zetaris/views/` |
| Agents | Orchestrator plus 4 agents; fixed SQL checks find the leaks and the model ranks, explains and recommends | `backend/src/agents/` |
| Engines | World Model, H-MEM and Markovian, each given one injected model function `llm.generate()` | `backend/src/engines/` |
| Power | Nightshift provider: bearer token, `meterless-app`, `meterless-scope`, `/v1/models` status, Auto Detect | `backend/src/llm/nightshift.ts` |
| API | Fastify on port 4000, 10 routes | `backend/src/server.ts`, contracts §4 |
| UI | Morning brief, leaks, evidence drawer, forecast with what-ifs | `web/` |

## One run, step by step

`POST /api/runs` starts a background run. The web polls `GET /api/runs/:id`. Each step writes `start` and `done` lines to `logs/<run_id>.jsonl`.

1. **Leak Hunter** runs fixed SQL checks on the views:
   - unbilled hours over 10%
   - a price rise over 15%
   - no login for over 60 days
   - an invoice over 30 days late
   - a rate below market
   - duplicate charges

   Each hit becomes a **Finding** with its SQL and rows as **Evidence**. The fast Nemotron lane only ranks and describes the findings; it never invents numbers.
2. **Explainer** answers "Why did my margin drop?" with a ranked chain of causes, each citing evidence. It runs as a Markovian loop, one hypothesis per bounded chunk with evidence carried forward, on the deep lane. If the data can't support a claim, it says so (`uncertain: true`).
3. **Forecaster** projects 6 months of cash in code (`forecast_math.ts`), not in the model. What-ifs ("lose client X", "raise prices N%") re-run the same math.
4. **CFO** ranks the top 3 moves by money impact and urgency. It pulls memories from H-MEM first, so past approvals and rejections change today's ranking. The result is the **Brief**.

When Sara approves or rejects a move (`POST /api/moves/:id/decision`), the decision is stored in H-MEM. The next run's brief reflects it, which is the "memory moment" in the demo.

## Contracts and ownership

All shapes (schema, views, agent JSON, API) are defined in [contracts.md](contracts.md). Each layer has one owner (see [plan.md](plan.md)). Until the real piece lands, everyone builds against mocks in these shapes: `ZETARIS_MOCK=1` for views, stub agents in `backend/src/agents/`, and `web/src/mock/*.json` for the UI.

## Ports on the integration machine

| Port | Service |
| --- | --- |
| 3000 | Zetaris web UI |
| 4000 | Ledger Lens API |
| 5173 | Ledger Lens web (Vite) |
| 5433 | Postgres (synthetic data) |
| 8088 | Meterless Nightshift runtime |
| 8888 | Zetaris REST API |
