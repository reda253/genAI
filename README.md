# Ledger Lens

AI agents that find money leaks in a freelancer's finances. Every number comes from Zetaris, every model call goes through Meterless Nightshift to Nemotron, and every action waits for the user's approval.

See [docs/plan.md](docs/plan.md) for the full architecture and work split, and [docs/contracts.md](docs/contracts.md) for the shared contracts.

## Repo layout

| Folder | Owner | What |
| --- | --- | --- |
| `docs/` | all | contracts, architecture, engine test evidence |
| `infra/` | P3 | Postgres docker-compose (port 5433) |
| `data/` | P3 | synthetic dataset, loader, answer key |
| `zetaris/` | P2 | sources, 4 views, catalog, setup script |
| `backend/` | P1, P2, P4, P5 | TypeScript / Node 20 / Fastify |
| `prompts/` | P5 | agent prompts |
| `evals/` | P3 | agents vs answer key |
| `web/` | P6 | React + Vite + Tailwind dashboard |
| `scripts/` | P1 | smoke test |
| `logs/` | — | run traces (generated, not committed) |

## Setup

1. `cp .env.example .env` and fill in your own values. **Never commit `.env`.**
2. Postgres: `docker compose -f infra/docker-compose.yml up -d`
3. Data: `python data/load_postgres.py`
4. Zetaris: `./zetaris/setup_zetaris.sh`
5. Backend: `cd backend && npm install && npm run dev`
6. Web: `cd web && npm install && npm run dev`

## Meterless Engines (P4)

Ledger Lens integrates three reference engines from [Meterless](https://github.com/Meterless/Meterless) inside `backend/src/engines/`, wired to Meterless Nightshift for Nemotron generation:

1. **World Model (`backend/src/engines/world-model/`)**:
   - Shared fact and entity graph representing clients, vendors, subscriptions, invoices, and detected leak findings.
   - Connected via `backend/src/engines/worldModelAdapter.ts` to ingest Zetaris views (`client_profitability`, `subscription_usage`, `ar_aging`) and query enriched entity contexts (`getEntityContext`).

2. **H-MEM (`backend/src/engines/hmem/`)**:
   - Hierarchical memory engine storing Sara's decisions (approvals/rejections with notes) across runs.
   - Connected via `backend/src/engines/hmemAdapter.ts` to retrieve past decisions during CFO brief synthesis, adjusting move urgency and ranking while generating human-readable `memory_note` annotations (the **Memory Moment**).

3. **Markovian (`backend/src/engines/markovian/`)**:
   - Bounded-step iterative reasoning engine carrying forward verified evidence and discarding ungrounded claims.
   - Connected via `backend/src/engines/markovianAdapter.ts` to investigate margin drop questions chunk-by-chunk across finding hypotheses.

All engine conformance tests and adapter integration tests are passing. See [docs/engine-tests.md](docs/engine-tests.md) for full test execution evidence.

_Sections to be filled in: Zetaris setup (P2), How the agents reason (P5)._


## Git rules

- Branches: `p1-backend`, `p2-zetaris`, `p3-data`, `p4-engines`, `p5-reasoning`, `p6-web`
- Small pull requests into `main`, at least once a day; Reda reviews and merges
- No large files: generated data and logs stay out of Git
