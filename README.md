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
3. Data: `python data/generate.py && python data/load_postgres.py`
4. Zetaris: `./zetaris/setup_zetaris.sh` (registers the Postgres + FX sources, creates the four views, verifies the numbers)
5. Backend: `cd backend && npm install && npm run dev`
6. Web: `cd web && npm install && npm run dev`

### Zetaris setup (P2)

The Zetaris platform must be running first (Participant Setup Guide steps
1.3–1.8; `./verify.sh` should print 9/9). Put your API key in `.env` and set
`ZETARIS_MOCK=0` for the real views.

```bash
# registers ledger_lens_pg + fx_rest and creates the four contract views
./zetaris/setup_zetaris.sh

# preview the SQL without calling Zetaris
./zetaris/setup_zetaris.sh --dry-run

# re-check the numbers only
./zetaris/setup_zetaris.sh --verify-only
```

The script prints the expected-value checks (unbilled hours, Adobe price rise,
Webflow unused, Nordwind late payer, Kestrel underpricing, Figma duplicate,
closing cash €8,420). On Linux the Postgres host is auto-detected; if your
Zetaris containers use another address, set `ZETARIS_PG_HOST` to the
docker-bridge or LAN IP. Full details, troubleshooting, and the screenshot
checklist are in [zetaris/README.md](zetaris/README.md).

Without Zetaris, keep `ZETARIS_MOCK=1`: the backend reads the committed view
fixtures in `backend/src/zetaris/mock/` and still runs the whole pipeline.
Rebuild them after regenerating data with `python zetaris/generate_mocks.py`.

_Remaining section to fill on the integration machine: Meterless engines (P4),
How the agents reason (P5)._

## Git rules

- Branches: `p1-backend`, `p2-zetaris`, `p3-data`, `p4-engines`, `p5-reasoning`, `p6-web`
- Small pull requests into `main`, at least once a day; Reda reviews and merges
- No large files: generated data and logs stay out of Git
