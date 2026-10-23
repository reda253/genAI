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

_Sections to be filled in: Zetaris setup (P2), Meterless engines (P4), How the agents reason (P5)._

## Git rules

- Branches: `p1-backend`, `p2-zetaris`, `p3-data`, `p4-engines`, `p5-reasoning`, `p6-web`
- Small pull requests into `main`, at least once a day; Reda reviews and merges
- No large files: generated data and logs stay out of Git
