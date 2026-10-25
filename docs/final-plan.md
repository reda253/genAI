# Final plan: Mon 26 Oct (build, freeze) + Tue 27 Oct (submit)

This plan replaces [monday-plan.md](monday-plan.md) and [improvements-plan.md](improvements-plan.md). It also adds the gaps from [approach-fit.md](approach-fit.md), where we compared our work with the hackathon APPROACH guide. Task numbers from the old plans are kept in brackets so you can find the details there: **[M3]** is Monday plan task 3, **[I1]** is improvement #1, **[G1]** is a new gap task.

**Deadline:** Tue 27 Oct, 23:45 UTC, through HackOS.

## Where we are (Sun 25 Oct)

- `main`: everything runs live. Eval 6/6, 0 false alarms; 124 backend tests pass.
- Branch `p1-docker` (ready, PR pending): `docker compose up -d --build` runs the whole app on any PC at http://localhost:4000. The new README has a 3-level setup. Checked in a fresh clone: 6/6. The container reaches Nightshift on the host.
- Open issues from the 25 Oct live run: one Leak Hunter call failed (Nemotron sent an empty reply); trace lines don't name the model.

## Rules

- **The API shapes in Contract v1.1 are fixed at 09:30.** P1 adds them to `docs/contracts.md` and `web/src/types.ts`. Everyone builds on mocks until the real endpoint lands.
- One branch and one PR per task (`feat/<id>-<name>`), with tests. P1 reviews every PR.
- **No new numbers from models.** Every EUR amount on screen comes from Zetaris rows.
- **18:00 cutoff:** a feature that isn't merged and working live by then is dropped. **22:00: tag `v1.0-freeze`.** After the tag, only bug fixes, and only through PRs.
- Never commit `.env` or keys. The NVIDIA key stays in Nightshift.

## Monday timeline

| Time | What |
| --- | --- |
| 08:30 | P1 merges `p1-docker`, then runs the baseline [M1] |
| 09:00 | 15-min call: confirm owners; P1 posts Contract v1.1 |
| 09:30–13:00 | Build on mocks. First PRs: G1, I1 backend, I4, I5 |
| 13:00–16:00 | The other PRs; P6 switches each screen to the real API as each PR merges |
| 16:00–18:00 | Integration on Reda's machine: live run, eval, stability [M2], memory and what-if checks [M4], bug fixes |
| 18:00 | **Cutoff** |
| 18:00–22:00 | Docs and submission files, secrets check, fresh-clone test |
| 22:00 | **Tag `v1.0-freeze`**, announce it in the group chat |

## Contract v1.1

```ts
// new trace events (TraceLine in backend/src/traces.ts)
{ event: 'llm_call', step, data: { model: string, ms: number, ok: boolean } }                  // I1 / M3
{ event: 'critique', step, data: { agent: 'explainer'|'cfo', problems: string[], revised: boolean } } // G1
{ event: 'escalated', step, data: { finding_ids: string[], reason: 'low_confidence' } }       // G2

GET  /api/runs/:id/trace      -> TraceLine[]
POST /api/moves/:id/draft     -> { move_id, kind: 'email'|'steps'|'invoice_lines', subject: string|null,
                                   body: string, ungrounded: number[] }
GET  /api/entities/:id        -> { id, kind: 'client'|'subscription', name, summary: string,
                                   facts: Record<string, string|number>, findings: Finding[], invoices: object[] }
GET  /api/memories            -> { id, text, decision: 'approve'|'reject', action_type, created_at }[]
DELETE /api/memories/:id      -> 204
GET  /api/changes             -> { previous_run_id: string|null, new: Finding[], resolved: Finding[],
                                   changed: { finding_id, field, before: number, after: number }[] }
```

## Part 1: Features (by 18:00)

Priority: 🔴 keep at any cost · 🟡 important · ⚪ drop first if late.

### 🔴 G1. Critique → revise loop (Explainer + CFO): P5

This fixes the guide's red flag: *"agents only run once in a fixed sequence."*
- **Explainer** (`backend/src/agents/explainer.ts`):
  - If `groundCauses` returns `ungrounded` amounts, send one revision request on the same lane: *"These amounts are not in the evidence rows: X. Revise using only the evidence."*
  - Mark the answer `uncertain` only if the revised answer still fails.
  - Trace `critique {agent:'explainer', problems, revised}`.
- **CFO** (`backend/src/agents/cfo.ts:127`):
  - Today, when `groundMoves` returns null, the CFO goes straight to its backup ranking.
  - Instead, send one revision request with the reason (wrong count, unknown finding id, bad `action_type`), then use the backup ranking if it fails again.
  - Make `groundMoves` return the reason, not just null. Trace `critique`.
- At most **one** revision per agent (keeps runs bounded).
- **Tests** (`scriptedLlm`):
  - The first reply invents an amount, the second is grounded: the answer is the revised one, with `uncertain:false`.
  - Both replies are bad: you get the backup answer.
  - The CFO's first reply cites an unknown finding, the second is valid: the revised moves are used.
- **UI (P6, with I1):** the timeline shows "Critic: 1 invented amount → revised".

### 🟡 G2. Branch on confidence: P5 (after G1)

- After Leak Hunter, the orchestrator sends findings with `confidence !== 'high'` to the Explainer (*"Is finding X supported by its evidence?"*) before the CFO ranks them.
- If the Explainer answers `uncertain`, the CFO gets that finding marked as not confirmed, and the move's `reason` says so.
- Trace `escalated`.
- **Test:** a medium-confidence finding triggers the Explainer step.

### 🔴 I1. Live agent timeline + model in every trace line: P1 backend, P6 UI (also covers M3)

- **Backend (P1):**
  - In `ctxFor` (`orchestrator.ts`), wrap `deps.llm.chat` so every call writes a trace line `llm_call {model, ms, ok}`.
  - Add `GET /api/runs/:id/trace`.
  - Trace `checks_done` in Leak Hunter and `memory_applied` in the CFO.
- **UI (P6):** `RunModal.tsx` polls the trace every second and shows each step, e.g. "6 SQL checks on Zetaris", "Nemotron Lightning · 7.9 s", "Markovian · 3 chunks", "Critic: revised", "H-MEM · 1 memory applied".
- **M3:** in Nightshift's run details, confirm Lightning handles Leak Hunter and Ultra handles the Explainer and CFO. Take a screenshot.
- **Tests:** the orchestrator writes `llm_call` lines with the model; a routes test covers the trace endpoint.

### 🔴 I2. Action drafts (shown, never sent): P5 backend (after G1), P6 UI

- `prompts/action_draft.md` + `backend/src/agents/drafter.ts`: a move plus its evidence produces a draft email, a list of steps, or invoice lines.
- Grounding: if any number isn't in the evidence, retry once, then fall back to a fixed template. The retry reuses the G1 critique pattern.
- `POST /api/moves/:id/draft` (P1 wires it). "Draft" button + modal with the label "Never sent automatically" (P6).
- **Tests:** a grounded reply passes; an invented amount gives the template; Nightshift offline gives the template.

### 🔴 I5. Money headline + real leaks badge: P6 (also covers M5)

- A Brief banner with three totals: leaking per month, at risk, and what today's 3 moves recover.
- Replace the hardcoded `6` in `Navbar.tsx` with the real findings count.
- Show a loading state during a live run.
- P3 checks every number on screen against `data/answer_key.json`.

### 🟡 I4. Persistent memory + "What I've learned" panel: P4 backend, P1 UI

- Pass `persistDir: logs/hmem` to H-MEM in `createEngines`.
- `GET` and `DELETE /api/memories`.
- A panel on the Brief page with a Forget button.
- **Tests:** after a restart, the memory is still there; after Forget, it no longer changes the ranking.
- In Docker, `logs/` is the `ledger_lens_logs` volume, so memory survives `docker compose up -d` too.

### 🟡 I3. Client 360 via World Model: P4 backend, P2 data, P6 UI

- **P2:** `ENTITY_SQL` with full view rows goes into `ingestZetarisData`.
- **P4:** `GET /api/entities/:id` through `getEntityContext`.
- **P6:** clickable client and vendor names open a drawer with a "What if I lose them?" button.

### ⚪ I6. Second persona (proof that it generalises): P3 data, P2 Zetaris, P5 eval

- Persona B: different seed, a different mix of leaks, its own answer key.
- Live eval with no code or prompt change.
- The README line reads: "Persona A 6/6, persona B N/N".

### ⚪ I7. What changed since the last run: P1

- Save each `RunResult` to `logs/runs/`.
- `GET /api/changes` + a strip above the moves.

### ⚪ I8. Grounding stats chip: P1

- From the I1 trace: "41 model calls · 3 revised by critic · 0 failed".
- Shown in RunModal and in the Brief footer.

**Drop order if late** (first to go at the top): I8, I7, I6, I3, I4, G2. Keep **G1, I1, I2, I5** at any cost: they carry the video and fix the red flag.

## Part 2: Verification (16:00–18:00, Reda's machine)

| Id | Task | Owner | Pass |
| --- | --- | --- | --- |
| M1 | Baseline on fresh `main` after the `p1-docker` merge: `npm test`, `tsc`, web build, one live run | P1 | 6/6, all green |
| M2 | `evals/stability.py`: 5 runs; POST the run, poll it, compare with `compare_findings` | P5 + P1 | 5/5 runs: 6/6 found, the same 3 `action_type`s, each run's duration printed. **0 `llm_failed`**; if Lightning keeps returning empty replies, raise `max_tokens` or add one retry in `nightshift.ts`, and document the backup ranking as designed behaviour |
| M4 | Memory moment: reject the Nordwind reminder, then rerun; the move drops in rank and shows its `memory_note`, with the same EUR amounts. What-ifs `lose_client` and `raise_prices` vs P5's spreadsheet | P4 + P5 | Matches |
| G1v | Live: at least one `critique` line in a trace, or force one with a test prompt for the video | P5 | Seen |
| I-all | Timeline shows Nemotron model names; Nordwind draft uses only evidence numbers; restart keeps memory; headline totals match the answer key | P1 | All |

## Part 3: Docs and submission files (18:00–22:00)

| Id | Task | Owner |
| --- | --- | --- |
| M6 | `metadata.json`: engine status set to `integrated`, plus `adapter`, `used_by`, integration tests, `prompts`, and `evals` (6/6). **Add `pre_existing`: the Meterless engine code in `backend/src/engines/` (Apache 2.0)** | P1 + P4 |
| M7 | README: the **"How the agents reason"** section (P5): SQL finds the leaks, Nemotron ranks, explains and decides; the critic loop (G1) and confidence branch (G2); grounding rules and backup answers; which model each agent uses. Add the Zetaris screenshots (P2) and the 4 UI screens (P6). The rest of the README is already done on `p1-docker` | P5, P2, P6; P1 merges |
| M7b | `docs/contracts.md` status: from DRAFT v0.1 to **v1.1 locked**. `docs/architecture.md`: add the prompt loader, the Leak Hunter ranking and the critic loop | P1 |
| G3 | **`examples/`**: `input.md` (the default question, run settings, each what-if body) + `brief.json`, `findings.json`, `explanation.json`, and one `trace.jsonl` from a good live run. Link it from the README | P3 |
| G4 | **`data/README.md` sources section**: synthetic generator (seed 20261001), FX rates from [currency-api](https://github.com/fawazahmed0/exchange-api) via jsDelivr (check its licence), record counts, how it's registered in Zetaris (`zetaris/setup_zetaris.sh`), how to regenerate, limitations | P3 + P2 |
| M8 | Secrets and repo hygiene: `git ls-files \| grep -i env` lists only `.env.example`; `git grep -nE "nvapi-\|Bearer [A-Za-z0-9]{20}"` finds nothing. **Remove `docs/setup-guide.pdf`** (21 MB, the organisers' document). Make the repo **public** | P1 |
| M9 | Fresh-clone test: follow the README word for word. Pass 1: Docker Level 1 (no `.env`). Pass 2: native dev with `ZETARIS_MOCK=1`. Fix the README wherever it's wrong | P1, P2 on call |
| M10 | Tag `v1.0-freeze`, announce it | P1 |

## Part 4: Tuesday (submission only, no code)

| Item | What the guide requires | Owner | Due |
| --- | --- | --- | --- |
| **Demo video (1–4 min)** | Main workflow, how the agent solves the problem, key features, how Zetaris and Meterless are used. Story: brief → leak → evidence → Why? (critic revises) → what-if → draft → reject → rerun with memory. Show the timeline with the Nemotron model names | P6 records, P1 narrates | 16:00 |
| **Slide deck** *(new, wasn't planned)* | Problem and users; the solution; agent workflow / architecture diagram (with the critic loop); tech stack; how Zetaris and Meterless are used and what was unique; product screenshots; future work (real bank, invoicing and time-tracker connectors, see below) | P5 + P3 | 16:00 |
| **Sponsor tech explanation** | Zetaris integration; each engine: what it does + its test (`docs/engine-tests.md`); how the app connects to Nightshift; where Nemotron contributes; what was unique | P1 + P4, from README + `metadata.json` | 18:00 |
| **HackOS form** | Track 03, repo link, video, deck, pre-existing components declared | P1 | **20:00** (3 h buffer) |

Future-work slide content: right now only the synthetic generator fills the 5 tables. For real use, you'd need bank (Open Banking), invoicing and time-tracker connectors, detection of recurring charges, usage data from Google/Microsoft sign-in or vendor APIs, one database per user, and hosted AI.

## Who does what

| Person | Monday (in order) | Tuesday |
| --- | --- | --- |
| **P1 Reda** | Merge `p1-docker` + M1 → Contract v1.1 → I1 backend → I4 UI → wire I2 route → I7/I8 if time → integration 16:00 → M6, M7b, M8, M9, M10; reviews every PR | Narrate the video, sponsor text, submit |
| **P2** | I3 entity SQL → I6 persona B (Zetaris) → Zetaris screenshots (M7) → G4 with P3 → on call for M9 | Check the Zetaris slides |
| **P3** | I6 persona B data → number checks on screen (I5) → G3 examples → G4 | Slide deck with P5 |
| **P4** | I4 memory persistence + endpoints → I3 entities endpoint → M4 memory check → M6 engine section | Sponsor text (engines) |
| **P5** | **G1 critic loop (first)** → G2 → I2 drafter → M2 stability → M4 what-ifs → M7 "How the agents reason" | Slide deck |
| **P6** | I5 headline → I1 timeline (with the critic line) → I2 draft modal → I3 drawer → I7 strip → 1920×1080 screenshots | Record the video |

## Done on Monday night when

- [ ] G1, I1, I2 and I5 are merged and working live; a trace shows `llm_call` model names and at least one `critique` line.
- [ ] Live eval 6/6; stability 5/5 with 0 `llm_failed` (or the backup ranking documented as designed behaviour).
- [ ] Backend tests and typecheck green; the web app builds.
- [ ] `examples/`, the `data/README.md` sources section, `metadata.json` with `pre_existing`.
- [ ] Fresh clone works with Docker and with native dev, following the README alone.
- [ ] No secrets tracked, the PDF removed, the repo public.
- [ ] `v1.0-freeze` pushed.
