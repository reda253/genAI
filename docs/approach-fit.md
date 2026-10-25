# Ledger Lens vs the hackathon APPROACH guide

Source: "How to APPROACH Solutioning For Your Track", [HackOS resources](https://hackathon.genai.works/resources?id=01a08ff1-5485-7712-bcc8-c7eabb04b702). Checked against `main` plus branch `p1-docker` on Sun 25 Oct.

**Verdict:** we fit Track 03 (Reasoning Architecture) well. The guide's own Track 03 example (clinic front desk, H-MEM memory of past decisions) is close to what we built. One structural risk: our agents run once in a fixed order with no critique loop, which the guide lists as a red flag. Plus a few missing submission items. All fixable on Monday. The plan is in [final-plan.md](final-plan.md).

## Our problem statement (guide Step A format)

> We are building an agent that helps a freelancer stop losing money by finding leaks in their invoices, time logs, subscriptions and bank data through Zetaris, explaining each leak with evidence, forecasting cash, and producing 3 ranked moves the user approves or rejects, which the agents remember on the next run.

## What we have vs what the guide asks

✅ done · ⚠️ partly · ❌ missing

### Problem, scope and data (Steps A, P, P, R)

| Guide asks | Status | Where we stand |
| --- | --- | --- |
| Narrow user, decision and output | ✅ | One freelancer (Sara), 6 leak types, a brief with 3 moves |
| Ambition level matches the team | ✅ | Ambitious level: 4 agents, 2 Zetaris sources, 3 Meterless engines, team of 6 |
| Data served through Zetaris, no manual steps | ✅ | Postgres + public FX API → 4 views; `zetaris/setup_zetaris.sh` automates it |
| Small, synthetic, legal data | ✅ | `data/generate.py` (fixed seed), 9 clients, 54 invoices, 168 bank lines |
| `SAMPLE_MODE` fallback | ✅ | `ZETARIS_MOCK=1` + fixed backup answers when Nemotron fails; Docker Level 1 needs no keys |
| Timeouts, bounded retries | ✅ | `ZETARIS_TIMEOUT_MS`; `AbortSignal.timeout` on every Nightshift call |
| `data/README.md` documents sources | ⚠️ | Describes the dataset plan. Missing: a source/licence section (synthetic generator; FX from [currency-api](https://github.com/fawazahmed0/exchange-api) via jsDelivr), record counts, how it's registered in Zetaris, how to regenerate |

### Agent behaviour (Step O): our biggest risk

| Guide checklist item | Status | Where we stand |
| --- | --- | --- |
| Specialist agent uses data or tools | ✅ | Leak Hunter runs 6 SQL checks on the Zetaris views |
| Agents share memory or state | ✅ | World Model (shared facts), H-MEM (past decisions) |
| Fallback path when data or an API fails | ✅ | Every agent has a fixed backup answer; the run still finishes |
| Final answer has traceable evidence | ✅ | Each finding carries its SQL and rows; Explainer causes cite finding ids |
| Risk agent flags unsupported claims | ⚠️ | Explainer checks every amount against the evidence and marks the answer `uncertain` if one is missing. It's a check, not an agent, and it never asks for a revision |
| Evaluator critiques, agent revises | ❌ | No critique → revise loop anywhere |
| Workflow branches on confidence | ❌ | `confidence` is computed but never changes the flow |
| Human in the loop | ✅ | Approve / reject on every move |

[orchestrator.ts:61-71](../backend/src/agents/orchestrator.ts#L61-L71) runs Leak Hunter → Explainer → Forecaster → CFO, each once. The guide's red flags include: *"Your agents only run once in a fixed sequence."* We meet its "at least three" rule, but the weak-pattern diagram is our diagram. This costs Technical (20) and Innovation (15) points.

### Technical constraints (Step A)

| Rule | Status | Where we stand |
| --- | --- | --- |
| Zetaris is the data layer, local in Docker | ✅ | Agents use SELECT on views only |
| A Meterless Engine in a working feature, with a test | ✅ | H-MEM → memory moment, Markovian → Explainer, World Model → shared state; `docs/engine-tests.md` |
| Nightshift is the AI provider | ✅ | `backend/src/llm/nightshift.ts` |
| NVIDIA wherever it helps | ✅ | Nemotron 3.5 Lightning (Leak Hunter), Nemotron 3 Ultra (Explainer, CFO) |
| No keys committed; NVIDIA key only in Nightshift | ✅ | `.env.example` has placeholders only; check again before the freeze |
| **Logs show which model handled each request** | ❌ | `logs/<run_id>.jsonl` has no `model` field (checked on a live run, 25 Oct) |
| Sample inputs and outputs included | ❌ | No `examples/` folder |
| No manual setup, runs from a clean clone | ✅ | `docker compose up -d --build` (branch `p1-docker`), checked in a fresh clone: 6/6 |
| Bounded runtime (target 5–10 min) | ✅ | 1.5 to 4 min live |
| Light repo | ⚠️ | The 21 MB `docs/setup-guide.pdf` is tracked; remove it (organisers' document) |
| Reliable live runs | ⚠️ | 1 Leak Hunter call failed on the 25 Oct live run (Nemotron returned an empty reply; the backup ranking took over) |
| Pre-existing components declared | ⚠️ | Meterless engine code is declared in the README. Also put it in `metadata.json` and the HackOS form. First commit is 23 Oct, inside the window |

### Evaluation fit (Step C), honest self-score

| Question | 0–2 |
| --- | --- |
| Explain the problem in 30 s | 2 |
| Know the user | 2 |
| Data served through Zetaris | 2 |
| Working version in 144 h | 2 |
| Runs quickly and predictably | 2 (stability check pending) |
| Zetaris and a Meterless Engine have a real role | 2 |
| Agents interact more than once | **1** |
| Critique, validation or retry | **1** |
| Useful output in a 1–4 min demo | 2 |
| Limitations documented | 2 |
| **Total** | **18/20: strong candidate** |

### Submission (Step H)

| Item | Status |
| --- | --- |
| Demo video, 1–4 min | ❌ Tuesday; script outline in the Monday plan |
| Slide deck | ❌ **Not planned anywhere yet** |
| Public repo + README (setup, usage, dependencies) | ⚠️ README rewritten on `p1-docker`; needs the "How the agents reason" section; repo must be public |
| Sponsor technology explanation | ⚠️ README "Sponsor tech" section + `metadata.json`; needs the engine tests, the Nightshift connection and "what was unique" written out for the form |
| Logs or traces showing how agents worked | ⚠️ Traces exist, but without model names |
| Sample mode without Zetaris, Nightshift or credentials | ✅ |

## What has to be done

1. **Critique → revise loop (Explainer + CFO).** Fixes the red flag; gives the demo a "critic caught an invented number" moment.
2. **Branch on confidence.** Low-confidence findings go to the Explainer for evidence before the CFO may rank them.
3. **Model name in every trace line** (improvements #1 backend).
4. **`examples/`** with one input (the question + run settings) and outputs (`brief.json`, `findings.json`, one trace).
5. **`data/README.md` sources section** (source, licence, counts, Zetaris registration, regenerate).
6. **Slide deck** with the sections the guide lists.
7. **Sponsor explanation text** for the HackOS form.
8. **Pre-existing components** in `metadata.json` and the form.
9. **Remove `docs/setup-guide.pdf`**, make the repo public, run the secret checks.
10. **Stability:** 5 live runs with 0 `llm_failed`, or document the fallback as designed behaviour.

Owners and timing: [final-plan.md](final-plan.md).
