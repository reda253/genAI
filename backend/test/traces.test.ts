import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTracer } from '../src/traces.ts';

test('writes one JSON line per event', () => {
  const t = createTracer('run_x', mkdtempSync(join(tmpdir(), 'tr-')));
  t.log('leak_hunter', 'start');
  t.log('leak_hunter', 'done', { n: 6 });
  expect(t.file.endsWith('run_x.jsonl')).toBe(true);
  const lines = readFileSync(t.file, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  expect(lines).toHaveLength(2);
  expect(lines[1]).toMatchObject({ run_id: 'run_x', step: 'leak_hunter', event: 'done', data: { n: 6 } });
  expect(lines[1].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

test('creates the logs dir if missing', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'tr-')), 'nested', 'logs');
  createTracer('run_y', dir).log(null, 'hello');
  expect(readFileSync(join(dir, 'run_y.jsonl'), 'utf8')).toContain('"event":"hello"');
});
