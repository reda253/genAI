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

const orchestrator = createOrchestrator({
  llm,
  logsDir: config.logsDir,
  sql: zetaris.querySql,
  deepModel: config.meterless.deepModel,
});

const app = buildServer({
  orchestrator,
  checks: {
    nightshift: () => llm.status(),
    zetaris: () => zetaris.ping(),
  },
});

await app.listen({ port: config.port, host: '127.0.0.1' });
console.log(`Ledger Lens API on http://127.0.0.1:${config.port}`);
