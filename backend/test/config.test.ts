import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, loadDotEnv } from '../src/config.ts';

test('defaults when env is empty', () => {
  const c = loadConfig({});
  expect(c.port).toBe(4000);
  expect(c.meterless.model).toBe('nvidia/nemotron-3.5-lightning-30b-a3b');
  expect(c.meterless.deepModel).toBe('nvidia/nemotron-3-ultra-550b-a55b');
  expect(c.zetaris.mock).toBe(false);
  expect(c.logsDir.endsWith('logs')).toBe(true);
});

test('reads values from env', () => {
  const c = loadConfig({
    PORT: '5000', METERLESS_BASE_URL: 'http://x/v1', METERLESS_RUNTIME_TOKEN: 't',
    METERLESS_MODEL: 'm', METERLESS_DEEP_MODEL: 'd', ZETARIS_MOCK: '1',
    ZETARIS_VIEW_SCHEMA: 'custom_schema', ZETARIS_QUERY_LIMIT: '50',
    ZETARIS_TIMEOUT_MS: '9000',
  });
  expect(c).toMatchObject({
    port: 5000,
    meterless: { baseUrl: 'http://x/v1', token: 't', model: 'm', deepModel: 'd' },
    zetaris: {
      mock: true,
      viewSchema: 'custom_schema',
      queryLimit: 50,
      timeoutMs: 9000,
    },
  });
});

test('loadDotEnv does not throw', () => expect(() => loadDotEnv()).not.toThrow());

test('token falls back to <stateDir>/proxy-token when env has none', () => {
  const dir = mkdtempSync(join(tmpdir(), 'state-'));
  writeFileSync(join(dir, 'proxy-token'), 'file-token\n');
  expect(loadConfig({ METERLESS_STATE_DIR: dir }).meterless.token).toBe('file-token');
  expect(loadConfig({ METERLESS_STATE_DIR: dir, METERLESS_RUNTIME_TOKEN: 'env' }).meterless.token).toBe('env');
  expect(loadConfig({ METERLESS_STATE_DIR: join(dir, 'missing') }).meterless.token).toBe('');
});

test('HOST defaults to loopback, overridable', () => {
  expect(loadConfig({}).host).toBe('127.0.0.1');
  expect(loadConfig({ HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
});
