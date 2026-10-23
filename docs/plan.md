# Ledger Lens — Architecture & 6-Person Work Split

Oct 23, 2026 · @reda

## Architecture

Agents never touch raw data: every number comes from Zetaris, every model call goes through Meterless Nightshift to Nemotron, and every action waits for the user's approval.

&#91;embedded content: system architecture · Data, Build, Power\]

How each layer meets the official Setup Guide rules:

| Layer | What we use | Rule it satisfies |
| --- | --- | --- |
| Data | Zetaris in Docker, Postgres source, one REST source, 4 views | Must use Zetaris, running locally |
| Build | Meterless World Model, H-MEM and Markovian in working features, with conformance tests | At least one Meterless Engine integrated and demonstrable |
| Power | Nightshift as the app's primary AI provider, Nemotron lanes behind it | Nightshift must be a primary provider; Nemotron required for the NVIDIA award |
| Code tools | Claude Code (Reda), any editor or AI helper for the others | Cursor is now optional, per the organizers |

Why TypeScript for the backend: the Meterless engine reference implementations are TypeScript, so we reuse them and run their conformance suites directly. The data generator and evals stay in Python.

## Who does what

Six owners, one layer each, all starting today on mock data so nobody waits; Reda's laptop is the integration machine where everything runs together for the demo.

| # | Person | Owns | Machine needs |
| --- | --- | --- | --- |
| 1 | Reda | Repo, backend skeleton, Nightshift connection, integration, code review | Zetaris + Nightshift running (Zetaris already done), Claude Code |
| 2 | Linux teammate | Zetaris sources, 4 views, setup script, Zetaris client | Docker + Zetaris (Linux runs it natively, no WSL) |
| 3 | Data engineer | Synthetic dataset, Postgres, answer key, evals | Python + Docker (Postgres only, light) |
| 4 | Engines lead | Meterless World Model, H-MEM, Markovian | Node 20 only |
| 5 | Reasoning lead | Prompts, forecast and what-if math, Nemotron lanes | Node 20 + Nightshift + NVIDIA key |
| 6 | 8 GB teammate | React dashboard | Node 20 + browser only, no Docker |

**Working rules**

- **Contracts first (today, 1 hour):** data schema, view columns, agent output JSON and API endpoints go into `docs/contracts.md`. After that, change a contract only by telling everyone in the group chat.
- **Mocks everywhere:** each person builds against fake data in the agreed shape, then switches to the real piece when it lands.
- **One branch per person, pull requests into `main`,** reviewed by Reda. Never commit `.env` or keys.
- **Daily 15-minute sync** at the same time each evening: what works, what's blocked.

**Milestones**

- **Fri Oct 23 (tonight):** repo created, contracts agreed, everyone's setup done
- **Sat Oct 24:** every part works alone on mocks
- **Sun Oct 25:** real data flows end to end on Reda's machine: Postgres, Zetaris, agents, Nightshift, dashboard
- **Mon Oct 26:** memory, what-ifs, polish; feature freeze at night
- **Tue Oct 27:** video and submission (not in this plan); hard deadline 23:45 UTC

Note: the official rules cap teams at 5 registered members, and every contributor must be registered. The work is split six ways as asked; staffing it within the rules is the team's call.

## Person 1 — Reda: architect & integration lead

You hold the whole system together: the repo, the backend skeleton, the Nightshift connection, and the integration machine where the demo runs. You have Claude Code, so you take the glue code nobody else can do quickly.

**What you need and how to set it up**

- [x] Windows + WSL Ubuntu + Docker Desktop, Zetaris running and verified (done)
- [ ] Zetaris API token in your project `.env` and the curl test returning data
- [ ] Node 20 in Ubuntu: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash`, reopen the terminal, then `nvm install 20`
- [ ] Meterless Nightshift (Windows edition) from meterless.ai, verified by email, installed and running
- [ ] NVIDIA API key from build.nvidia.com, pasted into Nightshift's **Setup > Providers > NVIDIA** (never into the repo)
- [ ] Nightshift **NIGHT > LANES**: lane 1 a fast Nemotron, lane 2 a deep Nemotron; run a test inside Nightshift
- [ ] Copy the Runtime URL and token from Nightshift's **Console** into your project `.env` as `METERLESS_BASE_URL`, `METERLESS_RUNTIME_TOKEN`, `METERLESS_MODEL`
- [ ] Run the guide's `smoke_test.py` until it shows 3 PASS lines

**Tasks**

- **Fri Oct 23**
  - [ ] Create the GitHub repo with the structure at the end of this doc, add all teammates, protect `main`
  - [ ] Write `docs/contracts.md` with the team (copy the tables from the role plans)
  - [ ] Commit `.gitignore`, `.env.example`, empty folders with `.gitkeep`
- **Sat Oct 24**
  - [ ] Backend skeleton in `backend/`: Fastify server, config loader, trace logger writing JSONL to `logs/`
  - [ ] `backend/src/llm/nightshift.ts`: paste the **POWER > Add Meterless as a provider** prompt from meterless.ai/engines.html into Claude Code and implement it (Bearer token, `meterless-app` and `meterless-scope: user` headers, `GET /v1/models`, `POST /v1/chat/completions`)
  - [ ] Orchestrator with 4 stub agents and the API routes returning mock JSON, so Person 6 can connect
- **Sun Oct 25**
  - [ ] Merge Person 2's Zetaris client, Person 4's engines, Person 5's prompts; replace stubs one by one
  - [ ] First full run on your machine: Postgres, Zetaris views, agents, Nightshift, dashboard
- **Mon Oct 26**
  - [ ] Fix integration bugs, pin a Nemotron lane so runs visibly use Nemotron (check Nightshift's run details)
  - [ ] Write `metadata.json` (engines used and where) and the README setup section; feature freeze at night

**Done when:** `docker compose up` (Postgres) plus `npm run dev` in `backend/` and `web/` gives a working app on your machine, with every model call going through Nightshift.

## Person 2 — Zetaris lead (Linux teammate)

You make Zetaris the single door to all data: sources, the 4 views, a one-command setup script, and the TypeScript client agents call. Linux runs Docker natively, so Zetaris is fastest on your machine.

**What you need and how to set it up**

- [ ] At least 16 GB RAM and 15 GB free disk (tell Reda now if not)
- [ ] Docker Engine + Compose plugin: `sudo apt install docker.io docker-compose-v2`, then `sudo usermod -aG docker $USER` and log out and in
- [ ] Register at cloud.enterprise.zetaris.com, download `zetaris-platform.zip` from **Run locally**, copy the login command
- [ ] Follow Setup Guide steps 1.3 to 1.8 exactly (no WSL needed): preflight, `.env` admin account, `docker compose pull`, `up -d`, `./verify.sh` 9/9, Pikachu query 2 rows
- [ ] Create an API token in the Zetaris UI and test the REST API with curl
- [ ] Node 20 (`nvm install 20`) and `git clone` of the team repo

**Tasks**

- **Fri Oct 23**
  - [ ] Agree the view contract (in `docs/contracts.md`) with Persons 1, 3 and 5
- **Sat Oct 24**
  - [ ] `backend/src/zetaris/client.ts`: `querySql(sql)` posts to `/sql-editor/sqls/run` with Bearer token, `X-Org-ID`, fresh `X-Request-ID`; returns `{rows, sql, ranAt}`; refuses anything but `SELECT`
  - [ ] Until views exist, the client can return rows from `backend/src/zetaris/mock/*.json` (env flag `ZETARIS_MOCK=1`)
  - [ ] Register Person 3's Postgres as a Lightning database; it must be reachable from inside the Zetaris containers, so use `host.docker.internal` (or your LAN IP on Linux) instead of `localhost`
  - [ ] Register one public REST source (an exchange-rate API) following the PokeAPI recipe
- **Sun Oct 25**
  - [ ] Write the 4 views as files in `zetaris/views/`; check numbers against Person 3's answer key
  - [ ] `zetaris/setup_zetaris.sh`: registers sources and creates views in one command, so Reda can rebuild them on his machine
  - [ ] `zetaris/catalog.json`: one-line description per view and column for the prompts
- **Mon Oct 26**
  - [ ] Run the setup script on Reda's machine with him; fix whatever differs
  - [ ] Write the README "Zetaris setup" section and take 2 screenshots of sources and a view query

**Done when:** a fresh Zetaris plus `setup_zetaris.sh` gives 4 correct views, and agents read data only through `querySql`.

## Person 3 — Data engineer

You create the world the agents investigate: 6 months of money data for one freelancer, "Sara", with 5-6 hidden leaks, loaded into Postgres, plus the answer key that proves the agents found them.

**What you need and how to set it up**

- [ ] Python 3.11 with a virtual environment: `python -m venv .venv`, then `pip install pandas faker numpy psycopg2-binary`
- [ ] Docker Desktop (Windows/Mac) or Docker Engine (Linux); only a small Postgres container runs, so 8 GB RAM is enough
- [ ] Git and the team repo cloned

**Tasks**

- **Fri Oct 23**
  - [ ] Write the persona and leak list in `data/README.md`: 9 clients with rates and payment terms, typical costs, and the leaks (unbilled hours, quiet price rise, unused subscription, late payer, underpriced service, duplicate charge)
  - [ ] Propose the data schema in `docs/contracts.md` (tables: `clients`, `bank_transactions`, `invoices`, `time_logs`, `subscriptions`)
- **Sat Oct 24**
  - [ ] `infra/docker-compose.yml` with a Postgres 16 service on port 5433 (5432 may clash with Zetaris), a named volume, and credentials from `.env`
  - [ ] `data/generate.py` with a fixed seed: background activity for Apr-Sep 2026, then the planted leaks; writes `data/answer_key.json`
  - [ ] `data/load_postgres.py`: creates the tables and loads the data in one command
  - [ ] Send Person 2 the connection details the same day
- **Sun Oct 25**
  - [ ] Sanity checks script: balance never negative, invoices equal hours times rate except planted leaks
  - [ ] Make it believable: seasonality, odd amounts, invented vendor names; tag `data-v1` in Git
- **Mon Oct 26**
  - [ ] `evals/check_findings.py`: compares the agents' findings with the answer key and prints found, missed, false alarms
  - [ ] Run it after each change and report misses to Person 5; check every number on the dashboard with Person 6

**Done when:** `docker compose -f infra/docker-compose.yml up -d` plus `python data/load_postgres.py` rebuilds identical data, and every planted leak is in the answer key.

## Person 4 — Meterless engines lead

You bring in the Meterless engines and make them do real work: World Model holds shared facts about clients and vendors, H-MEM remembers Sara's decisions, Markovian runs the long "why" investigation in bounded steps. The rules require engines in working features with passing tests, not just mentioned.

**What you need and how to set it up**

- [ ] Node 20 (Windows: nodejs.org installer; Linux/Mac: `nvm install 20`) and Git
- [ ] Read meterless.ai/engines.html and the GitHub repo github.com/Meterless/Meterless: README, then `engines/world-model`, `engines/hmem`, `engines/markovian` AGENTS.md
- [ ] Try the H-MEM reference once in a scratch folder: `npx degit meterless/meterless/engines/hmem my-hmem`, then `cd my-hmem/reference && npm install && npm test`

**Tasks**

- **Sat Oct 24**
  - [ ] Copy the reference implementations into `backend/src/engines/world-model`, `hmem`, `markovian` (Apache 2.0, keep their license notes)
  - [ ] Wire their model function to Reda's `llm/nightshift.ts` (one injected `generate()`), using mocks until it exists
  - [ ] Get each engine's conformance suite or reference tests passing inside our repo; save the output in `docs/engine-tests.md`
- **Sun Oct 25**
  - [ ] World Model: ingest the rows from Zetaris views as entities (clients, vendors, invoices, findings); expose `getContext(entityId)` for agents
  - [ ] Markovian: run the Explainer as chunks, one hypothesis per chunk, with carryover of evidence
- **Mon Oct 26**
  - [ ] H-MEM: after each approve or reject, store it; at run start, retrieve the top memories and pass them to the CFO ranking
  - [ ] Demo check with Reda: approve a move, rerun, show the brief changed because of memory
  - [ ] Write the "Meterless engines" part of the README and `metadata.json` entries (which engine, which file, which test)

**Done when:** all three engines run inside the backend, their tests pass, and the memory moment works live.

## Person 5 — Reasoning & Nemotron lead

You make the agents smart and honest: they find the real leaks, explain them with evidence, compute correct what-ifs in code, and say "not sure" when the data can't support a claim. Your work is also what competes for the NVIDIA Nemotron award.

**What you need and how to set it up**

- [ ] Node 20 and Git
- [ ] NVIDIA account on build.nvidia.com and an API key; note the exact Nemotron model names available to you
- [ ] Meterless Nightshift installed (Windows or Mac edition), NVIDIA key in **Setup > Providers**, one Nemotron lane active, test passing inside Nightshift
- [ ] Your own `.env` with Nightshift's Console URL and token, so you can test prompts locally through Nightshift like the real app

**Tasks**

- **Sat Oct 24**
  - [ ] `prompts/leak_hunter.md`: input = view rows, output = findings in the agreed JSON; test on Person 2's mock rows until it always parses
  - [ ] Leak Hunter's fixed SQL checks first (unbilled hours > 10%, price rise > 15%, no login > 60 days, invoice > 30 days late, rate under market); the model only ranks and describes
  - [ ] `backend/src/agents/forecast_math.ts`: 6-month cash projection plus scenarios "lose client X" and "raise prices N%"; check one scenario by hand in a spreadsheet
- **Sun Oct 25**
  - [ ] `prompts/explainer.md`: causes with amounts and evidence; forbid any number not present in the evidence rows
  - [ ] `prompts/cfo_rank.md`: top 3 moves ranked by money impact and urgency, each with a reason and an evidence link
  - [ ] Choose lanes: fast Nemotron for Leak Hunter, deep Nemotron for Explainer and CFO
- **Mon Oct 26**
  - [ ] With Person 3, run the evals until all planted leaks are found; add the uncertainty rule
  - [ ] Run the full pipeline 5 times: outputs must be stable (low temperature, strict JSON)
  - [ ] Write the README section "How the agents reason", naming the Nemotron models used

**Done when:** every planted leak is found, every number is traceable to rows, and what-if runway matches the hand calculation.

## Person 6 — Frontend lead (8 GB teammate)

You build what the judges see: a dashboard where Sara understands her money in 10 seconds, opens the evidence behind any claim, and approves or rejects each move. You need no Docker and no Zetaris, so 8 GB of RAM is fine.

**What you need and how to set it up**

- [ ] Node 20 (nodejs.org installer), Git, VS Code or any editor, Chrome
- [ ] Team repo cloned; inside it: `npm create vite@latest web -- --template react-ts`, then `cd web && npm install && npm install tailwindcss @tailwindcss/vite recharts`
- [ ] Nothing else: you work on mock JSON and only connect to the real backend on Reda's machine during integration

**Tasks**

- **Fri Oct 23**
  - [ ] Sketch 4 screens on paper: Morning brief, Leaks, Evidence drawer, Forecast
- **Sat Oct 24**
  - [ ] App shell with left navigation; `web/src/mock/*.json` written exactly to the agent JSON contract
  - [ ] Morning brief: cash today, what changed, top 3 move cards with Approve and Reject
  - [ ] `web/src/api.ts`: one `API_URL` setting; uses mocks when `VITE_USE_MOCKS=true`
- **Sun Oct 25**
  - [ ] Leaks list: card per finding with money impact and confidence badge
  - [ ] Evidence drawer: the claim, the SQL (monospace, copyable) and a small table of the rows
  - [ ] Forecast page: balance line over 6 months; what-if buttons add a second line and show runway before and after
- **Mon Oct 26**
  - [ ] Switch from mocks to Reda's real API on his machine; loading states while agents run
  - [ ] Check every number on screen with Person 3; make it look good at 1920x1080 for the video

**Done when:** all 4 screens work on the real API, every claim opens its evidence in one click, and a first-time viewer gets the brief in 10 seconds.

## GitHub repo structure

One public repo, one folder per owner, so six people rarely edit the same file. Create it empty, push this layout with `.gitkeep` files in empty folders, then everyone branches from `main`.

```
ledger-lens/
├── README.md                  # setup, usage, architecture, sponsor tech (all)
├── metadata.json              # Meterless engines used and where (P1, P4)
├── .gitignore                 # .env, node_modules, .venv, data/out, logs/*
├── .env.example               # every variable name, no real values (P1)
├── docs/
│   ├── contracts.md           # schema, views, agent JSON, API (all)
│   ├── architecture.md        # diagram and data flow (P1)
│   └── engine-tests.md        # Meterless test evidence (P4)
├── infra/
│   └── docker-compose.yml     # Postgres on port 5433 (P3)
├── data/                      # (P3)
│   ├── README.md              # persona and planted leaks
│   ├── requirements.txt
│   ├── generate.py
│   ├── load_postgres.py
│   └── answer_key.json
├── zetaris/                   # (P2)
│   ├── sources/               # register Postgres + REST source (.sql)
│   ├── views/                 # the 4 views (.sql)
│   ├── catalog.json           # view and column descriptions
│   └── setup_zetaris.sh       # one command: sources + views
├── backend/                   # TypeScript, Node 20
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── server.ts          # Fastify + routes (P1)
│       ├── config.ts          # reads .env (P1)
│       ├── traces.ts          # JSONL logger (P1)
│       ├── llm/nightshift.ts  # Meterless provider (P1)
│       ├── zetaris/           # client.ts + mock/ (P2)
│       ├── engines/           # world-model/ hmem/ markovian/ (P4)
│       └── agents/            # orchestrator.ts (P1); leakHunter, explainer,
│                              # forecaster, cfo, forecast_math.ts (P5)
├── prompts/                   # leak_hunter.md, explainer.md, cfo_rank.md (P5)
├── evals/
│   └── check_findings.py      # agents vs answer key (P3)
├── web/                       # React + Vite + Tailwind (P6)
│   └── src/                   # pages/, components/, mock/, api.ts
├── scripts/
│   └── smoke_test.py          # from the Setup Guide (P1)
└── logs/                      # run traces (generated, .gitkeep only)
```

**Git rules**

- Branch names: `p1-backend`, `p2-zetaris`, `p3-data`, `p4-engines`, `p5-reasoning`, `p6-web`
- Small pull requests into `main`, at least once a day; Reda reviews and merges
- `.env` never committed; each person copies `.env.example` to `.env` and fills their own values
- No large files: generated data and logs stay out of Git
- Before Reda's first push, run `git check-ignore .env` to confirm it prints `.env`
