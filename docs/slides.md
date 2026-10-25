# Ledger Lens — slide deck outline

**Status:** draft for P5, P2, and P6 review.
**Format:** 10 slides, 16:9, about 3 minutes of speaker notes.
**Audience:** Open Agent Hackathon 2026 judges, Track 03 (Reasoning Architecture).
**Visual deck:** [`docs/slides/deck.html`](slides/deck.html) · [`ledger-lens-deck.pdf`](slides/ledger-lens-deck.pdf)

Each slide below has the on-slide content, speaker notes, the source of every
claim, and the owner who must confirm it. Items marked `[confirm]` are not
final until that owner signs off.

---

## 1. Title

**On slide**

# Ledger Lens
### An AI finance team for freelancers
**Track 03 — Reasoning Architecture**

Open Agent Hackathon 2026

**Speaker notes (5s)**

> Ledger Lens is an AI finance team for a freelancer. It finds where her money
> leaks, proves each leak with data, and recommends three moves she approves or
> rejects.

**Source:** `README.md`, `metadata.json`
**Owner:** P3

---

## 2. The problem

**On slide**

### Sara has nine clients and no CFO

- Freelance brand and UI designer in Casablanca, invoices in EUR
- Six months of clients, invoices, time logs, subscriptions, and bank transactions
- Money leaks in six places: unbilled hours, a quiet price rise, an unused tool,
  a late payer, an underpriced service, and a duplicate charge
- Her accounting tool shows history. It does not tell her what to do next.

**Speaker notes (20s)**

> Sara is a freelancer, not a finance team. Her data already contains the
> answers, but they are spread across five tables. The leaks are small enough
> to miss one by one and large enough to matter together: about €1,918 a month,
> plus €4,800 stuck in overdue invoices.

**Source:** `data/README.md` §1–§5, `data/answer_key.json`
**Owner:** P3

---

## 3. The solution

**On slide**

### A morning brief, not another dashboard

- Six findings, each with the SQL and the rows that prove it
- Three ranked moves with a EUR impact and an action type
- Sara approves or rejects each move; nothing is sent automatically
- The agents remember her decision on the next run
- Every number comes from a Zetaris view, never from the model

**Speaker notes (15s)**

> The output is deliberately short: what changed, what it costs, and the three
> decisions for today. The evidence stays one click away, and the human keeps
> the decision.

**Source:** `README.md` "What works today", `docs/contracts.md` §3
**Owner:** P3

---

## 4. How the agents work

**On slide**

### Four agents, one evidence trail

```
Leak Hunter ──► Explainer ──► Forecaster ──► CFO
  6 SQL checks   why + cited   6-month cash   3 ranked moves
  + ranking      causes        + what-ifs     + H-MEM memory
        │              │              │              │
        └──────────────┴──────────────┴──────────────┘
                    evidence + trace
```

- **Leak Hunter:** fixed SQL checks find the leaks; the fast model ranks and
  describes them.
- **Explainer:** Markovian reasoning on the deep model; every cause cites a
  finding.
- **Forecaster:** deterministic math in code, not a model.
- **CFO:** deep model ranks three moves; H-MEM changes the ranking from past
  decisions.
- **Critic loop `[confirm P5]`:** reject a model answer that invents a number;
  retry once, then use the deterministic fallback.

**Speaker notes (25s)**

> The important design choice is separation. SQL finds the facts. The models
> rank, explain, and choose wording. Code does the cash math. If a model answer
> is not grounded in the evidence, the critic rejects it and the system falls
> back to a safe answer.

**Source:** `docs/architecture.md`, `backend/src/agents/`, `docs/contracts.md` §5
**Owner:** P5

---

## 5. Zetaris: the data layer

**On slide**

### Agents never touch raw tables

```
Postgres (5 tables) ──┐
                      ├──► Zetaris ──► 4 contract views ──► agents
FX rates (public REST)┘              client_profitability
                                     cash_position
                                     subscription_usage
                                     ar_aging
```

- One SELECT-only client (`querySql`) is the only read path.
- Every finding stores the SQL and the rows behind it.
- Postgres source `ledger_lens_pg`; FX source `fx_rest`; container
  `ledger_lens`.
- Setup: `./zetaris/setup_zetaris.sh`, with `--dry-run` and `--verify-only`.
- The demo can run from committed view fixtures (`ZETARIS_MOCK=1`) or live
  Zetaris (`ZETARIS_MOCK=0`).

`[P2: add a Zetaris UI screenshot of the four views here]`

**Speaker notes (20s)**

> Zetaris is not decoration. It is the contract between the data and the agents.
> The agents see four views, not five raw tables, and every number on screen can
> be traced back to a view query and its rows.

**Source:** `zetaris/README.md`, `docs/architecture.md`, `data/README.md` §12
**Owner:** P3, review with P2

---

## 6. The reasoning stack

**On slide**

### Meterless engines + NVIDIA Nemotron

| Layer | What it does | Where |
|---|---|---|
| **Nemotron 3.5 Lightning** | Fast lane: ranks and describes findings | Leak Hunter |
| **Nemotron 3 Ultra** | Deep lane: explanations and CFO moves | Explainer, CFO |
| **Markovian** | Bounded step-by-step investigation, evidence carried forward | Explainer |
| **World Model** `[confirm P4]` | Shared entity state; the current run ingests findings, entity rows are the next step | Agents |
| **H-MEM** | Remembers approve/reject decisions and changes ranking | CFO |

**Build:** TypeScript + Fastify · React + Vite + Tailwind · Postgres 16 · Docker · Zetaris · Meterless Nightshift

- Grounding rule: a model may only cite amounts that appear in the finding or
  its evidence rows.
- If Nightshift is offline, deterministic fallbacks keep the same numbers.
- Full trace: `logs/<run_id>.jsonl`, one line per step and model call.

**Speaker notes (25s)**

> This is the reasoning architecture the track asks for. Nemotron does the
> language work, but it is bounded by evidence. Markovian gives the Explainer a
> step-by-step loop. H-MEM makes the next run different because Sara made a
> decision. The deterministic fallback is deliberate: a demo without an API key
> still finds the same six leaks.

**Source:** `docs/architecture.md`, `metadata.json`, `docs/engine-tests.md`
**Owner:** P5

---

## 7. The product

**On slide**

### Four screens that tell the story

`[P6: replace with 1920×1080 screenshots]`

1. **Brief** — money headline, what changed, three ranked moves
2. **Leaks + evidence** — finding cards and the SQL/rows behind each one
3. **Forecast** — six-month projection and what-ifs
4. **Why? / timeline** — cited causes and the agent trace with model names

`[optional fifth image: draft modal with "Never sent automatically"]`

**Speaker notes (25s)**

> The demo follows one story: open the brief, inspect a leak, ask why, run a
> what-if, draft the reminder, reject it, then rerun and show the memory change.
> The screens are the proof that the architecture is a product, not a diagram.

**Source:** `README.md`, `web/src/pages/`, final-plan video story
**Owner:** P6

---

## 8. Proof

**On slide**

### The numbers are checkable

| Check | Result |
|---|---:|
| Planted leaks found | **6/6** |
| False alarms | **0** |
| Data sanity checks | **1,256 passed** |
| Backend tests | **124 passed** `[P1: refresh at freeze]` |
| Monthly leaks | **€1,918** |
| Cash at risk | **€4,800** |
| Closing cash | **€8,420** |
| Dataset | 9 clients, 10 subscriptions, 54 invoices, 132 time logs, 168 transactions, 942 billable hours |

- `evals/check_findings.py` compares live findings with the answer key.
- `data/sanity_checks.py` checks the dataset and every planted leak.
- `examples/` contains one captured run with its inputs, outputs, and trace.

**Speaker notes (15s)**

> The demo is not hand-waved. The eval knows the six planted leaks and checks
> the live findings against them. The data layer has 1,256 checks. The example
> run is in the repo, including the trace.

**Source:** `evals/check_findings.py`, `data/sanity_checks.py`, `data/answer_key.json`, `examples/`
**Owner:** P3

---

## 9. What is unique

**On slide**

### Not a chatbot over a spreadsheet

- **Federated data:** Postgres + a public FX source behind one Zetaris layer
- **Grounded reasoning:** SQL finds facts; models rank, explain, and choose
  wording; code does the forecast
- **Visible engines:** World Model, H-MEM, and Markovian are real, tested
  integrations, not prompt labels
- **Human-in-the-loop by design:** every move waits for approval, and the
  decision changes the next run
- **Honest fallback:** without Nightshift, the same six leaks and numbers still
  work

**Speaker notes (15s)**

> Most finance demos stop at "the model read the data and wrote a summary." The
> difference here is the chain: Zetaris views, evidence, grounded model output,
> deterministic math, a human decision, and memory that changes the next run.

**Source:** `README.md`, `docs/architecture.md`, `metadata.json`
**Owner:** P3, review with P5

---

## 10. Future work

**On slide**

### From a synthetic demo to a real finance team

- Real bank data through Open Banking
- Invoicing and time-tracker connectors
- Detection of recurring charges from bank data
- Usage data from Google/Microsoft sign-in or vendor APIs
- One database per user; hosted AI instead of a desktop runtime
- Receipts and partial payments

**Speaker notes (10s)**

> The current dataset is synthetic and the connectors are the next step. The
> architecture is already shaped for them: the agents read views, so a new
> source becomes a new Zetaris source and view, not a rewrite of the agents.

**Source:** `docs/final-plan.md` "Future-work slide content", `data/README.md` §12
**Owner:** P3

---

## Review checklist

- [ ] P5 confirms slides 4 and 6: critic-loop status, model lanes, engine names.
- [ ] P2 confirms slide 5: source names, view names, setup command.
- [ ] P6 supplies the four screenshots and, if available, the draft modal.
- [ ] P1 refreshes the backend-test count at freeze.
- [ ] Every number matches `data/answer_key.json` / `data/out/summary.json`.
- [ ] No slide claims an unmerged feature is live.
- [ ] The deck and the video use the same story: brief → leak → evidence → why
      → what-if → draft → reject → rerun with memory.
