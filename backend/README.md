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
| P2 | `src/zetaris/client.ts` | export `querySql(sql): Promise<QueryResult>`, then pass it as `sql` in `src/main.ts` |
| P4 | `src/engines/*` | the model function is `llm.generate(prompt)`; store decisions in `orchestrator.decide()` (marked `P4`) |
| P5 | `src/agents/leakHunter.ts`, `explainer.ts`, `forecaster.ts`, `cfo.ts` | replace the stub bodies, keep the signatures; `ctx.sql`, `ctx.llm`, `ctx.trace` are there |
| P6 | `web/src/mock/*.json` | same shapes the API returns |

Nightshift: use full model ids (`nvidia/nemotron-3.5-lightning-30b-a3b` fast, `nvidia/nemotron-3-ultra-550b-a55b` deep). `llm.chat()` already strips `</think>` reasoning and defaults to `max_tokens` 2000.
