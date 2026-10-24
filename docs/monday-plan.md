# Monday Oct 26: polish, docs, fresh-clone test, feature freeze

## Where we are

PR #8 is merged. The whole chain runs live on Reda's machine: Postgres → Zetaris → 4 agents → Nightshift → Nemotron.

- **Eval:** 6/6 leaks found, 0 false alarms.
- **Memory moment:** works live.
- **Tests:** 122/122 backend tests pass.

**Monday goal:** stable demo, docs a judge can follow, and a **feature freeze tonight**. Tuesday is only for the video and the submission (deadline Tue 23:45 UTC).

**Order matters.** We verify first, while there's still time to fix bugs. Then we write the docs. The fresh-clone test comes last, because it tests the docs.

## Who does what

| Person | Monday tasks |
| --- | --- |
| P1 Reda | 1, 3, 6, 7, 8, 9, 10; reviews every PR |
| P2 | Zetaris screenshots for the README; on call during the fresh-clone test (9) |
| P3 | Checks every number on screen (5); runs the evals in 2 |
| P4 | Memory moment check (4); engine part of `metadata.json` (6) |
| P5 | Stability runs (2); what-if check (4); "How the agents reason" README section (7) |
| P6 | Web polish and screenshots (5) |

Same rules as before:
- One branch per person, small PRs into `main`.
- Never commit `.env` or keys.

## Tasks

### 1. Baseline on fresh `main` (P1, 15 min)

- Pull `main`: `git checkout main; git pull`.
- Check the build:
  - `npm test` and `npx tsc --noEmit` in `backend/`
  - `npm run build` in `web/`
- Start Postgres, Zetaris and Nightshift, then do one live run.
- `python evals/check_findings.py` should print **6/6 found, 0 false alarms**.

### 2. Stability: 5 full runs (P5, with P1)

- Write a small script, `evals/stability.py`. For each of 5 runs it:
  - POSTs `/api/runs`, then polls `/api/runs/:id` until done.
  - Fetches `/api/findings` and `/api/brief`.
  - Compares the findings with `compare_findings` from `evals/check_findings.py`.
- **Pass:** all 5 runs meet every check below, and the script prints each run's duration.
  - 6/6 leaks and 0 false alarms.
  - The same 3 move `action_type`s.
  - No `llm_failed` lines in `logs/<run_id>.jsonl`.
- Temperature is already 0. If the moves still change between runs, tighten `prompts/cfo_rank.md` instead of changing code.

### 3. Show that Nemotron is used (P1)

- Check that the model calls in `logs/<run_id>.jsonl` name the model. If they don't, add `model` to the trace.
- In Nightshift's run details, confirm Lightning handles the Leak Hunter calls and Ultra handles Explainer and CFO.
- Take a screenshot for the README and the video.

### 4. Memory moment and what-ifs on `main` (P4 and P5, with P1)

- **Memory moment:**
  1. Reject the Nordwind reminder.
  2. Rerun.
  3. Check that the move drops in rank, shows its `memory_note`, and keeps the same EUR amounts.
- **What-ifs:** run `lose_client` and `raise_prices` through `/api/forecast/what-if`. Compare one runway with P5's hand-made spreadsheet.
- **Known gap:** H-MEM memories live in memory only, so a backend restart loses them. This is optional, and worth doing if there's time: save memories to `logs/hmem.json` after each decision and load them at startup. Write the test first.

### 5. Web polish (P6; P3 checks the numbers)

- The leaks badge in `web/src/components/Navbar.tsx` is hardcoded to `6`. Show the real findings count instead.
- Show a loading state during a live run (about 85 s).
- P3 checks every number on screen against `data/answer_key.json`.
- Take screenshots of all 4 screens at 1920×1080 for the README and the video.

### 6. `metadata.json` (P1 and P4)

- Change each engine's status from `"implemented"` to `"integrated"`.
- For each engine, add:
  - `adapter`: its `backend/src/engines/*Adapter.ts` file.
  - `used_by`: which part calls it (orchestrator, Explainer or CFO).
  - Integration tests: `backend/test/engines/adapters.test.ts` and `memoryMoment.test.ts`.
- Add `prompts`: the `prompts/*.md` files, loaded by `backend/src/agents/prompts.ts`.
- Add `evals`: `evals/check_findings.py`, result 6/6.

### 7. README and docs (P1 owns; each owner writes their section)

- **`README.md`:**
  - Prerequisites: Node, Python, Docker, Zetaris, Nightshift.
  - Nightshift and Nemotron setup (P1). The NVIDIA key goes only in Nightshift's Providers screen, never in the repo. Then set up the lanes and copy the Console URL and token into `.env`.
  - The order to start everything in, the eval command, a short demo walkthrough, and the screenshots.
- **"How the agents reason"** (P5; P1 drafts it if P5 runs late):
  - SQL finds the leaks, and Nemotron ranks, explains and decides.
  - The grounding rules and fallbacks.
  - Which model each agent uses.
  - Delete the `_Remaining section…_` line.
- **`docs/contracts.md`:** change the status from DRAFT v0.1 to **v1.0 locked**.
- **`docs/architecture.md`:** add the prompt loader and the Leak Hunter ranking.
- **`.env.example`:** check that every variable read in `backend/src/config.ts` is listed.

### 8. Secrets and repo hygiene (P1)

- `git ls-files | grep -i env` should list only `.env.example` files.
- `git grep -nE "nvapi-|Bearer [A-Za-z0-9]{20}"` should find nothing.
- Decide whether to keep the 21 MB `docs/setup-guide.pdf`. It's the organizers' document, so we can probably remove it from the repo.

### 9. Fresh-clone test (P1, last, about 1 h)

- `git clone` into an empty folder and follow the README **word for word**: Postgres, data, the Zetaris setup script, backend, web, eval.
- When a step is wrong, fix it in the README.
- Second pass with `ZETARIS_MOCK=1`, for a judge who doesn't have Zetaris.

### 10. Feature freeze (everyone, tonight)

- Tag `v1.0-freeze` on `main` and announce it in the group chat. **After the tag, only bug fixes, and only through PRs.**
- Get Tuesday ready:
  - **Video script:** brief → leak → evidence → Why? → what-if → reject → rerun with memory.
  - **Submission fields:** take them from `metadata.json`.

## Done tonight when

- [ ] A fresh clone runs using the README alone.
- [ ] The live eval prints 6/6, and the stability check passes 5/5.
- [ ] Backend tests pass, the typecheck is clean, and the web app builds.
- [ ] No secrets are tracked in git.
- [ ] The `v1.0-freeze` tag is pushed.
