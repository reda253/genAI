# Ledger Lens

Sara is a freelance designer. She has nine clients, a stack of subscriptions, and no time to look at her books. Money slips away: hours she never billed, a tool that got more expensive, a client who pays late, a project priced too low.

Ledger Lens is an AI finance team that finds those leaks for her. Four agents read her data through Zetaris, reason with NVIDIA Nemotron through Meterless Nightshift, and hand her a short brief with three ranked moves. **Nothing happens without her approval:** each move waits for her to approve or reject it, and the agents remember her decisions on the next run.

## What works today

| Part | What it does |
| --- | --- |
| **Leak Hunter** | Six SQL checks over the Zetaris views find the leaks (unbilled hours, price rise, unused tool, late payer, underpricing, duplicate tool). Nemotron Lightning ranks them. |
| **Explainer** | Answers "Why?" questions with cited evidence. The Markovian engine reasons step by step and drops any claim the data does not back. |
| **Forecaster** | 6-month cash forecast computed in code, plus what-ifs: lose a client, raise prices by N%. |
| **CFO** | Picks three moves with EUR amounts (Nemotron Ultra). H-MEM remembers what Sara approved or rejected and adjusts the ranking, with a visible `memory_note` (the "memory moment"). |
| **Dashboard** | Brief, findings with evidence, forecast and what-ifs, approve / reject. Status dots show whether Zetaris and Nightshift are live. |
| **Traces** | Every run writes `logs/<run_id>.jsonl`: each agent step and model call. |
| **Evals** | `evals/check_findings.py` compares the findings with the answer key: **6/6 found, 0 false alarms**. 128 backend tests pass. |

**Known limits**

- H-MEM memories live in memory, so restarting the backend forgets past decisions.
- Nightshift is a desktop app (Windows / macOS). Without it, the agents fall back to deterministic answers: the leaks and numbers are the same, but the wording is fixed.
- A live run with Nemotron takes about 1.5 to 4 minutes.

## Architecture

```
 Postgres (synthetic data) ─┐
                            ├─► Zetaris: 4 views ─► Agents ─────────────────► Nightshift ─► Nemotron
 FX rates (public REST) ────┘   client_profitability   Leak Hunter               (Meterless)    Lightning (fast)
                                cash_position          Explainer  + Markovian                   Ultra (deep)
                                subscription_usage     Forecaster + World Model
                                ar_aging               CFO        + H-MEM
                                                         │
                                       Fastify API + web dashboard on one port (4000)
```

Agents read data only through Zetaris views (SELECT only). Details: [docs/architecture.md](docs/architecture.md), API and data contracts: [docs/contracts.md](docs/contracts.md).

## Quick start (Docker, any PC)

**Level 1: the app with mock data and no AI keys.** You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) and Git.

```bash
git clone https://github.com/reda253/genAI.git
cd genAI
docker compose up -d --build
```

Open http://localhost:4000 and click **Run Audit**.

This starts Postgres, loads the dataset into it (the `seed` container runs once and exits), and starts the app. With no `.env` file, the app reads the four views from committed fixtures (`ZETARIS_MOCK=1`), and the Nightshift dot in the navbar is red because no token is set. The run still finds all six leaks.

> **Windows:** run Docker commands from PowerShell or cmd. From Git Bash, `--build` fails with `pass "--allow=fs.read=Dockerfile"`.

Stop with `docker compose down`. Reset everything, including the database, with `docker compose down -v`.

## Level 2: real Nemotron through Nightshift

1. Install Meterless Nightshift and start it.
2. In **Setup > Providers**, add your NVIDIA API key. The key stays in Nightshift only: never put it in `.env` or in the repo.
3. Set up the lanes: **fast** → `nvidia/nemotron-3.5-lightning-30b-a3b`, **deep** → `nvidia/nemotron-3-ultra-550b-a55b`.
4. Copy the runtime token from **Console** into a `.env` file at the repo root:
   ```bash
   cp .env.example .env
   # then set METERLESS_RUNTIME_TOKEN=<token from Nightshift Console>
   ```
5. Restart the app: `docker compose up -d`.

The container reaches Nightshift on your machine through `host.docker.internal:8088`. The Nightshift dot turns green when the health check says `online`. Check it with `curl http://localhost:4000/api/health`.

## Level 3: real data through Zetaris

1. Start the Zetaris platform (Participant Setup Guide steps 1.3 to 1.8; `./verify.sh` should print 9/9). It needs a registered account and about 8 GB of RAM, so it runs on the host, not in our compose file.
2. Put your Zetaris API key in `.env` (`ZETARIS_API_KEY`).
3. Register the sources and create the four views:
   ```bash
   ./zetaris/setup_zetaris.sh             # registers ledger_lens_pg + fx_rest, creates the views, checks the numbers
   ./zetaris/setup_zetaris.sh --dry-run   # preview the SQL without calling Zetaris
   ./zetaris/setup_zetaris.sh --verify-only
   ```
   The script prints the expected-value checks (unbilled hours, Adobe price rise, Webflow unused, Nordwind late payer, Kestrel underpricing, Figma duplicate, closing cash €8,420). On Linux the Postgres host is auto-detected; if your Zetaris containers use another address, set `ZETARIS_PG_HOST` to the docker-bridge or LAN IP.
4. Set `ZETARIS_MOCK=0` in `.env` and restart: `docker compose up -d`.

Full details, troubleshooting and the screenshot checklist: [zetaris/README.md](zetaris/README.md). After regenerating data, rebuild the mock fixtures with `python zetaris/generate_mocks.py`.

## Developer setup (app without Docker)

Needs Node 20.12+, Python 3.11+, and Docker for Postgres.

```bash
cp .env.example .env                              # fill in your values
docker compose -f infra/docker-compose.yml up -d  # Postgres on port 5433
python -m venv .venv
.venv/Scripts/pip install -r data/requirements.txt   # macOS/Linux: .venv/bin/pip
.venv/Scripts/python data/generate.py
.venv/Scripts/python data/load_postgres.py
```

Then, in two terminals:

```bash
cd backend && npm install && npm run dev   # API on http://localhost:4000
cd web && npm install && npm run dev       # dashboard on http://localhost:5173
```

With the native backend, Nightshift's token is read from `METERLESS_RUNTIME_TOKEN` or, if that is empty, from Nightshift's own state folder.

## Checking results

| Check | Command |
| --- | --- |
| Findings vs answer key (needs a finished run) | `python evals/check_findings.py` |
| Data and AI layers (Setup Guide, Check 3) | `.venv/Scripts/python scripts/smoke_test.py` (`pip install openai python-dotenv requests` once) |
| Backend tests and typecheck | `cd backend && npm test && npx tsc --noEmit` |
| Run traces from Docker | `docker compose cp app:/app/logs/. ./logs`, then open `logs/<run_id>.jsonl` |

A captured run is in [`examples/`](examples/): the inputs, `brief.json`,
`findings.json`, `explanation.json`, and a full `trace.jsonl`.

## Configuration

Every variable in [.env.example](.env.example). All are optional for Level 1.

| Variable | Default | What |
| --- | --- | --- |
| `ZETARIS_API_KEY` | empty | Zetaris API key (Level 3) |
| `ZETARIS_REST_URL` | `http://localhost:8888/api/v1.0` | Zetaris REST API. Docker uses `DOCKER_ZETARIS_REST_URL` instead |
| `ZETARIS_ORG_ID` | `1` | Zetaris organisation |
| `ZETARIS_MOCK` | `1` in Docker | `1` = read the views from `backend/src/zetaris/mock/`, `0` = real Zetaris |
| `ZETARIS_VIEW_SCHEMA` | `ledger_lens` | Zetaris container that holds the views |
| `ZETARIS_PG_DATASOURCE` | `ledger_lens_pg` | Postgres datasource name in Zetaris |
| `ZETARIS_PG_HOST` | auto | Postgres host as seen from the Zetaris containers |
| `ZETARIS_QUERY_LIMIT` | `1000` | Row limit per view query |
| `ZETARIS_TIMEOUT_MS` | `120000` | Zetaris query timeout |
| `METERLESS_BASE_URL` | `http://127.0.0.1:8088/v1` | Nightshift API. Docker uses `DOCKER_METERLESS_BASE_URL` instead |
| `METERLESS_RUNTIME_TOKEN` | empty | Token from Nightshift Console (Level 2) |
| `METERLESS_MODEL` | `nvidia/nemotron-3.5-lightning-30b-a3b` | Fast model (Leak Hunter) |
| `METERLESS_DEEP_MODEL` | `nvidia/nemotron-3-ultra-550b-a55b` | Deep model (Explainer, CFO) |
| `DOCKER_METERLESS_BASE_URL` | `http://host.docker.internal:8088/v1` | Nightshift as seen from the app container |
| `DOCKER_ZETARIS_REST_URL` | `http://host.docker.internal:8888/api/v1.0` | Zetaris as seen from the app container |
| `POSTGRES_HOST` | `localhost` | Postgres host for the native loader |
| `POSTGRES_PORT` | `5433` | Postgres port on the host |
| `POSTGRES_DB` | `ledger_lens` | Database name |
| `POSTGRES_USER` | `ledger` | Database user |
| `POSTGRES_PASSWORD` | `ledger_dev` | Database password (applied only when the volume is first created) |
| `PORT` | `4000` | API port |
| `HOST` | `127.0.0.1` (`0.0.0.0` in Docker) | Address the API binds to |
| `VITE_API_URL` | `http://localhost:4000` | API URL for the dev dashboard; empty = same origin |
| `VITE_USE_MOCKS` | `false` | `true` = the dashboard uses its own mock data |

## Sponsor tech

- **Zetaris:** the only data path. Two sources (Postgres, FX REST API) federated into four views. Client: `backend/src/zetaris/client.ts`.
- **Meterless:** Nightshift is the AI provider (`backend/src/llm/nightshift.ts`). Three Meterless engines run inside the backend:
  - **World Model** (`backend/src/engines/world-model/`): fact and entity graph of clients, vendors, subscriptions, invoices and findings. Adapter: `worldModelAdapter.ts`.
  - **H-MEM** (`backend/src/engines/hmem/`): Sara's approve / reject decisions across runs, used by the CFO. Adapter: `hmemAdapter.ts`.
  - **Markovian** (`backend/src/engines/markovian/`): bounded step-by-step reasoning for the Explainer. Adapter: `markovianAdapter.ts`.

  Test evidence: [docs/engine-tests.md](docs/engine-tests.md).
- **NVIDIA Nemotron:** Nemotron 3.5 Lightning ranks the leaks; Nemotron 3 Ultra writes the explanations and the CFO moves.

Submission details: [metadata.json](metadata.json).

## How the agents reason

Ledger Lens guarantees financial truthfulness through a multi-tier reasoning pipeline:

1. **Deterministic SQL Detection:** Fixed SQL queries over the 4 Zetaris views (client_profitability, cash_position, subscription_usage, r_aging) detect anomalies (unbilled hours, price rises > 15%, inactive subscriptions > 60 days, overdue invoices > 30 days, underpriced services, duplicate charges). Every claim carries verifiable evidence rows.
2. **NVIDIA Nemotron Dual Lanes:**
   - **Fast Lane (
vidia/nemotron-3.5-lightning-30b-a3b):** Leak Hunter scans and ranks anomalies into structured, typed findings with low latency.
   - **Deep Lane (
vidia/nemotron-3-ultra-550b-a55b):** Powers Explainer (bounded Markovian multi-chunk reasoning) and CFO (strategic multi-move ranking) for deep causal thinking.
3. **Critique & Revision Loop (G1):** When an agent output contains amounts or ids not found in the evidence, a critic step intercepts the response and sends a targeted revision prompt (critique trace event). If the revised reply still fails, deterministic fallbacks ensure runs remain robust and bounded.
4. **Confidence Escalation (G2):** Findings with confidence below high trigger an Explainer validation query before CFO prioritization (escalated trace event).
5. **Deterministic Forecast Math:** Cash projections over 6 months and what-if scenarios (lose_client, 
aise_prices) are computed strictly in TypeScript (orecast_math.ts), never approximated by the LLM.
6. **Action Drafts (I2):** Move recommendations generate actionable drafts (emails, checklists, invoice lines) for human review, never dispatched automatically.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Port 4000 or 5433 already in use | Stop the other program, or change the left side of `ports:` in `docker-compose.yml` / `POSTGRES_PORT` |
| `seed` exits with an error | `docker compose logs seed`. A database created earlier with another password: `docker compose down -v`, then `up` again |
| Health says `nightshift_status: "unauthorized"` | Nightshift is reachable but the token is wrong or missing: copy it again from Console into `METERLESS_RUNTIME_TOKEN` |
| Health says `nightshift_status: "offline"` | Nightshift is not running, or not on port 8088: set `DOCKER_METERLESS_BASE_URL` |
| Zetaris containers stopped (exit 137, out of memory) | `docker start zetaris-postgres-1 zetaris-driver-1 zetaris-api-1 zetaris-ui-1` |
| Navbar shows **MOCK DATA** | The dashboard uses its own mock data: click the toggle to switch to **LIVE API** |
| `pass "--allow=fs.read=Dockerfile"` | You are in Git Bash on Windows: use PowerShell or cmd |

## Team and repo layout

| Folder | Owner | What |
| --- | --- | --- |
| `docs/` | all | contracts, architecture, engine test evidence |
| `docs/slides/` | P3 + P5 | Tuesday deck: outline, HTML/CSS source, PDF |
| `infra/` | P3 | Postgres docker-compose (port 5433) |
| `data/` | P3 | synthetic dataset, loader, answer key |
| `zetaris/` | P2 | sources, 4 views, catalog, setup script |
| `backend/` | P1, P2, P4, P5 | TypeScript / Node 20 / Fastify |
| `prompts/` | P5 | agent prompts |
| `evals/` | P3 | agents vs answer key |
| `examples/` | P3 | one captured run: inputs, brief, findings, explanation, trace |
| `web/` | P6 | React + Vite + Tailwind dashboard |
| `scripts/` | P1 | smoke test |
| `logs/` | — | run traces (generated, not committed) |

**Pre-existing code:** the three Meterless engine reference implementations in `backend/src/engines/` (Apache 2.0) come from [Meterless](https://github.com/Meterless/Meterless).

**Git rules**

- Branches: `p1-backend`, `p2-zetaris`, `p3-data`, `p4-engines`, `p5-reasoning`, `p6-web`
- Small pull requests into `main`, at least once a day; Reda reviews and merges
- No large files: generated data and logs stay out of Git
- Never commit `.env` or keys
