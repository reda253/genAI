import { loadConfig, loadDotEnv } from './config.ts';
import { createNightshift } from './llm/nightshift.ts';
import { createOrchestrator } from './agents/orchestrator.ts';
import { createEngines } from './engines/index.ts';
import { buildServer } from './server.ts';

loadDotEnv();
const config = loadConfig();
const llm = createNightshift(config.meterless);
const engines = createEngines(llm);

const orchestrator = createOrchestrator({
  llm,
  engines,
  logsDir: config.logsDir,
  // P2: replace with querySql from ./zetaris/client.ts
  sql: () => Promise.reject(new Error('zetaris client not wired yet (P2)')),
});

const app = buildServer({
  orchestrator,
  checks: {
    nightshift: () => llm.listModels().then(() => true, () => false),
    zetaris: () => fetch(config.zetaris.restUrl, { signal: AbortSignal.timeout(3000) }).then(() => true, () => false),
  },
});

await app.listen({ port: config.port, host: '127.0.0.1' });
console.log(`Ledger Lens API on http://127.0.0.1:${config.port}`);
