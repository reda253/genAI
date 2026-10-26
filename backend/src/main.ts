import { existsSync } from 'node:fs';
import { loadConfig, loadDotEnv } from './config.ts';
import { autoDetect, createNightshift } from './llm/nightshift.ts';
import { createOrchestrator } from './agents/orchestrator.ts';
import { buildServer } from './server.ts';
import { createZetarisClient } from './zetaris/client.ts';

loadDotEnv();
const config = loadConfig();
let llm = createNightshift(config.meterless);
const zetaris = createZetarisClient(config.zetaris);

// Auto Detect: if the configured runtime is offline, probe the usual ports and use the first hit.
if ((await llm.status()) === 'offline') {
  const found = await autoDetect(config.meterless.token);
  if (found) {
    console.log(`Nightshift not at ${config.meterless.baseUrl}; auto-detected ${found}`);
    llm = createNightshift({ ...config.meterless, baseUrl: found });
  }
}

// The orchestrator creates the engines with its traced llm, so engine model calls land in the trace too.
const orchestrator = createOrchestrator({
  llm,
  logsDir: config.logsDir,
  sql: zetaris.querySql,
  model: config.meterless.model,
  deepModel: config.meterless.deepModel,
  demoCritic: config.demoCritic,
});
if (config.demoCritic) console.log('DEMO_CRITIC=1: the Explainer\'s first answer gets one invented amount for the critic to catch');

const app = buildServer({
  orchestrator,
  checks: {
    nightshift: () => llm.status(),
    zetaris: () => zetaris.ping(),
  },
  webDir: existsSync(config.webDir) ? config.webDir : undefined,
});

await app.listen({ port: config.port, host: config.host });
console.log(`Ledger Lens API on http://${config.host}:${config.port}`);
