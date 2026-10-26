import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Relative paths in .env are relative to the repo root, not the backend cwd. */
function resolveFromRoot(value: string): string {
  return value ? (isAbsolute(value) ? value : join(root, value)) : '';
}

// The runtime writes its token to <stateDir>/proxy-token.
// ponytail: Windows path verified; macOS/Linux paths are guesses, override with METERLESS_STATE_DIR.
function defaultStateDir(env: NodeJS.ProcessEnv): string {
  if (env.LOCALAPPDATA) return join(env.LOCALAPPDATA, 'ai.meterless.runtime');
  return process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support', 'ai.meterless.runtime')
    : join(homedir(), '.local', 'share', 'ai.meterless.runtime');
}

function readProxyToken(stateDir: string): string {
  try {
    return readFileSync(join(stateDir, 'proxy-token'), 'utf8').trim();
  } catch {
    return '';
  }
}

export interface Config {
  port: number;
  /** 0.0.0.0 inside Docker so the published port reaches the server. */
  host: string;
  logsDir: string;
  webDir: string;
  meterless: { baseUrl: string; token: string; model: string; deepModel: string };
  /** DEMO_CRITIC=1: show the G1 critic on camera (see AgentContext.demoCritic). */
  demoCritic: boolean;
  zetaris: {
    restUrl: string;
    apiKey: string;
    orgId: string;
    mock: boolean;
    viewSchema: string;
    mockDir: string;
    queryLimit: number;
    timeoutMs: number;
  };
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
    host: env.HOST || '127.0.0.1',
    logsDir: root + 'logs',
    webDir: root + 'web/dist',
    meterless: {
      baseUrl: env.METERLESS_BASE_URL ?? 'http://127.0.0.1:8088/v1',
      token: env.METERLESS_RUNTIME_TOKEN || readProxyToken(env.METERLESS_STATE_DIR ?? defaultStateDir(env)),
      model: env.METERLESS_MODEL ?? 'nvidia/nemotron-3.5-lightning-30b-a3b',
      deepModel: env.METERLESS_DEEP_MODEL ?? 'nvidia/nemotron-3-ultra-550b-a55b',
    },
    demoCritic: env.DEMO_CRITIC === '1' || env.DEMO_CRITIC === 'true',
    zetaris: {
      restUrl: env.ZETARIS_REST_URL ?? 'http://localhost:8888/api/v1.0',
      apiKey: env.ZETARIS_API_KEY ?? '',
      orgId: env.ZETARIS_ORG_ID ?? '1',
      mock: env.ZETARIS_MOCK === '1' || env.ZETARIS_MOCK === 'true',
      viewSchema: env.ZETARIS_VIEW_SCHEMA ?? 'ledger_lens',
      mockDir: resolveFromRoot(env.ZETARIS_MOCK_DIR ?? ''),
      queryLimit: Number(env.ZETARIS_QUERY_LIMIT) || 1000,
      timeoutMs: Number(env.ZETARIS_TIMEOUT_MS) || 120_000,
    },
  };
}
