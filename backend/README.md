# Ledger Lens backend

TypeScript, Node ≥ 20.12, Fastify. Reads the repo-root `.env`.

```bash
npm install
npm run dev        # http://127.0.0.1:4000 (3000 is the Zetaris UI)
npm test
npm run typecheck
```

Routes are the 10 in `docs/contracts.md` §4. Try: `curl -X POST localhost:4000/api/runs`, then `curl localhost:4000/api/brief`. Each run writes `logs/<run_id>.jsonl`.

## Where your piece plugs in

| Owner | File | Notes |
| --- | --- | --- |
| P2 | `src/zetaris/client.ts` | implemented: `querySql(sql)` is wired in `src/main.ts`; `ZETARIS_MOCK=1` uses `src/zetaris/mock/<view>.json`; live calls add the `ZETARIS_VIEW_SCHEMA` (default `ledger_lens`) prefix to unqualified contract views |
| P4 | `src/engines/*` | the model function is `llm.generate(prompt)`; store decisions in `orchestrator.decide()` (marked `P4`) |
| P5 | `src/agents/leakHunter.ts`, `explainer.ts`, `forecaster.ts`, `cfo.ts` | replace the stub bodies, keep the signatures; `ctx.sql`, `ctx.llm`, `ctx.trace` are there |
| P6 | `web/src/mock/*.json` | same shapes the API returns |

Nightshift: use full model ids (`nvidia/nemotron-3.5-lightning-30b-a3b` fast, `nvidia/nemotron-3-ultra-550b-a55b` deep) so runs visibly use Nemotron; `meterless/auto` and other `meterless/*` routing modes also work. `llm.chat()` strips `</think>` reasoning and defaults to `max_tokens` 2000.

`src/llm/nightshift.ts` implements the official POWER prompt (Meterless Runtime 1.4, provider contract v4): URL normalised to `<host>/v1`, real token required (`rt-local` rejected; falls back to `<stateDir>/proxy-token`), `meterless-app: ledger-lens` on every call, `meterless-scope: user` on chat, `status()` = online / unauthorized / offline from `GET /v1/models`, Auto Detect on ports 8088/8090/8787/11434 at startup, 180 s chat timeout, `parseConnectLink()` for `/connect#k=` links.
