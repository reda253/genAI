import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

export interface Config {
  port: number;
  logsDir: string;
  meterless: { baseUrl: string; token: string; model: string; deepModel: string };
  zetaris: { restUrl: string; apiKey: string; orgId: string; mock: boolean };
}

/** Loads the repo-root .env into process.env if it exists. */
export function loadDotEnv(): void {
  try {
    process.loadEnvFile(root + '.env');
  } catch {
    // no .env: run on defaults
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT) || 4000,
    logsDir: root + 'logs',
    meterless: {
      baseUrl: env.METERLESS_BASE_URL ?? 'http://127.0.0.1:8088/v1',
      token: env.METERLESS_RUNTIME_TOKEN ?? '',
      model: env.METERLESS_MODEL ?? 'nvidia/nemotron-3.5-lightning-30b-a3b',
      deepModel: env.METERLESS_DEEP_MODEL ?? 'nvidia/nemotron-3-ultra-550b-a55b',
    },
    zetaris: {
      restUrl: env.ZETARIS_REST_URL ?? 'http://localhost:8888/api/v1.0',
      apiKey: env.ZETARIS_API_KEY ?? '',
      orgId: env.ZETARIS_ORG_ID ?? '1',
      mock: env.ZETARIS_MOCK === '1' || env.ZETARIS_MOCK === 'true',
    },
  };
}
