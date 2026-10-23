# Open Agent Hackathon 2026 — Project Plan

Oct 19, 2026 · @reda

## The idea

We build an AI finance team for freelancers and one-person companies that finds where their money leaks, explains why, and proposes the next moves for them to approve. Working name: **Ledger Lens** (to rename).

- **User:** a freelancer or 2-5 person agency with no accountant on staff, whose money data is split across a bank account, an invoicing tool, a time tracker and a dozen subscriptions.
- **Problem:** they find out too late that a client is unprofitable, a subscription is unused, a price rose quietly, or cash will run short in three months.
- **Product:** one agent system that unifies those sources, answers "why did my margin drop?" with evidence, simulates what-ifs ("what if I lose my biggest client?"), and ranks today's actions. Nothing is sent or cancelled without the user's approval.
- **Track:** Track 03, Reasoning Architecture (turn data, memory and reasoning into reliable decisions and actions). Backup: Track 01, Fragmented Intelligence.
- **Inspiration:** ReStructure AI's "Grok Bot Finance Team" TikTok demo, rebuilt on the sponsor stack with real evidence trails.

## Why this wins

Every scoring criterion has a concrete answer in the build; Impact (30) and Technical (20) carry half the score, so they get most of our time.

| Criterion | Points | How we earn it |
| --- | --- | --- |
| Impact | 30 | One named persona ("Sara, freelance designer, 9 clients") with real pains in euros/dirhams: unbilled hours, unused tools, a client paying late |
| Technical | 20 | Reproducible repo, one-command setup, typed agents, JSONL traces of every reasoning step |
| Innovation | 15 | What-if simulation on a shared world model, plus memory of past decisions that changes tomorrow's advice |
| Demo | 15 | 3-minute story: shocking leak, why, what-if, approved action |
| Product & UX | 10 | One clean dashboard: morning brief, evidence drawer, approve/reject buttons |
| Sponsor tech | 10 | Zetaris semantic layer as the only data access path; 3 Meterless engines with visible roles; Nemotron reasoning; built in Cursor |

Two extra prizes are in reach with the same build: **Best use of NVIDIA Nemotron** (DGX Spark, $4,699) if Nemotron does the reasoning, and **Best Cursor-built product** ($2,301 credits).

## Architecture

Agents never touch raw files: every number goes through Zetaris, every piece of shared context through Meterless, and every action waits for the user.

&#91;embedded content: system architecture · 5 layers\]

Meterless engines are reference specs with TypeScript implementations, not a pip package, so we implement only the minimum services: World Model store, ingest and context builder; H-MEM store and retrieval; the Markovian orchestrator loop. Each engine takes one injected model function, which we point at Nemotron.

## MVP scope

We ship four agents on synthetic data for one fictional freelancer; everything else waits until those four work end to end.

**Must have (by Sat Oct 25)**

1. Synthetic dataset: 6 months of bank transactions, invoices, time logs, subscriptions and receipts for one persona, with 5-6 planted leaks (unbilled hours, unused tool, quiet price rise, late payer, underpriced service).
2. Zetaris semantic layer joining those sources into views: `client_profitability`, `cash_position`, `subscription_usage`, `ar_aging`.
3. **Leak Hunter** agent: scans the views and flags anomalies with the SQL and rows behind each one.
4. **Explainer** agent: answers "why did my margin drop?" with a cited chain of causes.
5. **Forecaster** agent: 6-month cash forecast plus what-if scenarios (lose a client, raise prices).
6. **CFO** orchestrator: morning brief with the top 3 ranked moves; user approves or rejects each.
7. Dashboard: brief, evidence drawer, forecast chart, approve buttons.
8. JSONL traces in `logs/` for every run.

**Nice to have (only if ahead)**

- Chat box for free questions
- Draft payment-reminder emails (shown, never sent)
- Second persona to prove it generalizes

**Out of scope**

- Real bank connections, real payments, sending emails
- Voice, mobile app, multi-user accounts

## Team roles

Five registered builders, five build roles, all coding from the first hour of Oct 22; the story work (video, deck, README) is shared by everyone on Oct 26-27. The official rules cap teams at 5 and require every member to be registered.

Nobody waits on anyone because we agree three contracts on the morning of Oct 22, and each person builds against mock data until the real piece arrives:

- **Data schema:** tables and columns for bank, invoices, time logs, subscriptions
- **View contract:** names and columns of the 4 Zetaris views
- **Agent output JSON:** the shape of a finding, an explanation, a forecast and a ranked move

| Role | Owns | Starts Day 1 with | Key deliverable |
| --- | --- | --- | --- |
| Data engineer | Synthetic dataset generator: 6 months for one persona, 5-6 planted leaks, realistic amounts | Writing the generator script from the agreed schema | Clean CSV and Postgres data where every planted leak is findable |
| Zetaris lead | Zetaris install, data sources, semantic-layer views, the SQL tool agents call | Connecting a sample CSV and the first view | 4 views returning correct numbers, queried through one tool |
| Agent backbone lead | Orchestrator loop, Meterless World Model, H-MEM and Markovian wiring, JSONL traces, API for the UI | The `agentathon-starter` template with mock views | Agents run end to end, remember decisions, log every step |
| Reasoning lead | Nemotron connection, prompts for Leak Hunter and Explainer, forecast and what-if math, evals | Prompts and forecast math on mock rows | Explanations that cite rows; what-if numbers checked by hand |
| Frontend lead | Dashboard: morning brief, evidence drawer, forecast chart, approve and reject | Screens built on mock agent JSON | A UI a judge understands in 10 seconds, wired to the real API by Oct 25 |

**Oct 26-27, all five together:** two people record and edit the demo video, two build the slide deck, one writes the README and runs the fresh-clone test; everyone reviews all three before submitting. Everyone codes in **Cursor** (mandatory) and commits to one GitHub repo. Owners pick names on Day 0.

## Timeline

We freeze features on Sat Oct 25 and submit by noon on Mon Oct 27, leaving almost 12 hours of buffer before the 23:45 UTC hard deadline.

&#91;embedded content: build timeline · Oct 20-27\]

- **Oct 20-21 (before kickoff):** every member registered and on the team; Zetaris installed and answering SQL; Meterless `agentathon-starter` running; Nemotron API key working; persona and leak list written.
- **Oct 22-23:** dataset generated, Zetaris views return correct numbers; agent skeleton writes traces.
- **Oct 24:** all four agents run end to end; first dashboard screens.
- **Oct 25:** what-ifs, approvals and memory working; full demo run with no manual fixes.
- **Oct 26:** record the video, build the deck, polish the README, fresh-clone test.
- **Oct 27:** submit by noon; the afternoon is buffer only.

## Demo and submission

The video tells one story in 3 minutes: Sara loses money she can't see, the agents find it, explain it, and fix it with her approval.

1. **0:00-0:20 Problem.** Sara, freelance designer: busy month, yet profit fell 11%. Her data sits in 4 tools.
2. **0:20-0:50 Unify.** Zetaris semantic layer: 4 sources, 1 view. Show the SQL.
3. **0:50-1:30 Why.** Explainer: margin fell because one client logged 62h but was billed 40h, and hosting rose 29%. Open the evidence drawer: rows and queries.
4. **1:30-2:10 What-if.** "What if I lose my biggest client?" Runway 7.5 to 3.1 months. "Raise prices 10%?" Runway to 9.8 months.
5. **2:10-2:40 Act.** Morning brief, top 3 moves; Sara approves two, rejects one. Next run remembers her choice (H-MEM).
6. **2:40-3:00 Architecture and sponsors.** One diagram: Zetaris, Meterless engines, Nemotron, Cursor.

(Numbers above are from the inspiration video; ours will come from our dataset.)

**Submission checklist (hard deadline Oct 27, 23:45 UTC)**

- [ ] Demo video, 1-4 minutes, shows Zetaris and Meterless integration
- [ ] Slide deck: problem, users, solution, architecture, stack, sponsor use, visuals, roadmap
- [ ] Public GitHub repo with README (setup, usage, dependencies), no secrets, no large data files
- [ ] Sponsor explanation: Zetaris, Meterless engines used and where, Cursor usage, Nemotron role
- [ ] `metadata.json` naming the Meterless engines used
- [ ] Pre-existing code declared (none planned)
- [ ] Fresh-clone test: a teammate runs the README cold
- [ ] Roster confirmed before creating the first submission (team locks then)

## Risks and open questions

The biggest risk is setup time on two unfamiliar tools; we cut it by installing everything before the build window opens.

| Risk | Fallback |
| --- | --- |
| Zetaris local install or Cloud Gateway eats Day 1 | Install before Oct 22 using the Participant Setup Guide; one person owns it; ask on Discord early |
| Meterless engines are specs, not a pip library (TypeScript references) | Start from the `agentathon-starter` template; implement only the minimum services listed in the Meterless README |
| Nemotron API limits or latency | Wrap the model in one injected generator function, as Meterless recommends, so switching provider is one line |
| Similar finance projects on Track 2 (e.g. FINMOZG) | Compete on Track 3; lead with what-if plus memory plus approvals, not only explanations |
| Demo numbers look fake | Plant leaks with realistic amounts; show the SQL behind every figure |
| Team size above the 5-member cap | Keep the roster at 5 registered members; an unregistered contributor can disqualify the whole team |

**Open questions**

- Final product name
- Persona currency: EUR, USD or MAD
- Agent code language: TypeScript (matches Meterless references) or Python with TS services

## Sources

- [Open Agent Hackathon 2026 event page and official rules](https://hackathon.genai.works/event/open-agent-hackathon-2026)
- [Meterless engines on GitHub](https://github.com/Meterless/Meterless)
- Hackathon Resources hub: Meterless README, Team Formation Rules, Disqualification Checklist, Strong Submission Examples (behind login)
