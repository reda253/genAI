import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../src/server.ts';
import { createOrchestrator } from '../src/agents/orchestrator.ts';
import type { Llm } from '../src/agents/types.ts';
import { findings } from '../src/agents/fixtures.ts';
import { mockSql } from './helpers.ts';

const nope = () => Promise.reject(new Error('unused'));
const llm: Llm = { chat: nope, generate: nope, listModels: nope };

function make(agents = {}) {
  const orchestrator = createOrchestrator({ llm, sql: mockSql, logsDir: mkdtempSync(join(tmpdir(), 'rt-')), agents });
  const app = buildServer({ orchestrator, checks: { zetaris: async () => false, nightshift: async () => 'online' } });
  return { app, orchestrator };
}

async function withRun() {
  const t = make();
  const res = await t.app.inject({ method: 'POST', url: '/api/runs' });
  await t.orchestrator.wait(res.json().run_id);
  return t;
}

const post = (url: string, payload: unknown) => ({ method: 'POST' as const, url, payload: payload as object });

test('GET /api/health', async () => {
  const res = await make().app.inject({ url: '/api/health' });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ ok: true, zetaris: false, nightshift: true, nightshift_status: 'online' });
});

test('before any run: brief, findings, forecast are 404 no_run_yet', async () => {
  const { app } = make();
  for (const url of ['/api/brief', '/api/findings', '/api/forecast']) {
    const res = await app.inject({ url });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('no_run_yet');
  }
});

test('POST /api/runs: 202, then 409 while running, then done', async () => {
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  const { app, orchestrator } = make({ leakHunter: async () => { await gate; return findings; } });
  const first = await app.inject({ method: 'POST', url: '/api/runs' });
  expect(first.statusCode).toBe(202);
  expect(first.json()).toMatchObject({ status: 'running' });
  const second = await app.inject({ method: 'POST', url: '/api/runs' });
  expect(second.statusCode).toBe(409);
  expect(second.json().error).toMatchObject({ code: 'run_in_progress', run_id: first.json().run_id });
  release();
  await orchestrator.wait(first.json().run_id);
  const status = await app.inject({ url: `/api/runs/${first.json().run_id}` });
  expect(status.json()).toMatchObject({ status: 'done' });
});

test('after a run: brief, findings, finding by id, unknown ids', async () => {
  const { app } = await withRun();
  expect((await app.inject({ url: '/api/brief' })).json().moves).toHaveLength(3);
  expect((await app.inject({ url: '/api/findings' })).json()).toHaveLength(6);
  expect((await app.inject({ url: '/api/findings/f001' })).json().id).toBe('f001');
  expect((await app.inject({ url: '/api/forecast' })).json().months).toHaveLength(6);
  for (const url of ['/api/findings/f999', '/api/runs/run_nope', '/api/nothing']) {
    const res = await app.inject({ url });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  }
});

test('POST /api/explain', async () => {
  const { app } = await withRun();
  const ok = await app.inject(post('/api/explain', { question: 'Why?', finding_id: null }));
  expect(ok.statusCode).toBe(200);
  expect(Array.isArray(ok.json().causes)).toBe(true);
  const bad = await app.inject(post('/api/explain', { question: '' }));
  expect(bad.statusCode).toBe(400);
  expect(bad.json().error.code).toBe('bad_request');
});

test('POST /api/forecast/what-if validates input', async () => {
  const { app } = await withRun();
  const ok = await app.inject(post('/api/forecast/what-if', { type: 'raise_prices', pct: 10 }));
  expect(ok.statusCode).toBe(200);
  expect(ok.json()).toHaveProperty('baseline');
  expect(ok.json()).toHaveProperty('scenario');
  for (const body of [{ type: 'raise_prices', pct: 0 }, { type: 'raise_prices', pct: 150 }, { type: 'lose_client' }, { type: 'nope' }]) {
    const res = await app.inject(post('/api/forecast/what-if', body));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('bad_request');
  }
});

test('Fastify client errors keep their 4xx status, never 500', async () => {
  const { app } = await withRun();
  const form = await app.inject({ method: 'POST', url: '/api/runs', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: 'x=1' });
  expect(form.statusCode).toBe(415);
  expect(form.json().error.code).toBe('bad_request');
  const badJson = await app.inject({ method: 'POST', url: '/api/explain', headers: { 'content-type': 'application/json' }, payload: '{nope' });
  expect(badJson.statusCode).toBe(400);
  expect(badJson.json().error.code).toBe('bad_request');
});

test('POST /api/runs accepts a JSON content-type with no body (browser fetch helper)', async () => {
  const { app, orchestrator } = make();
  const res = await app.inject({ method: 'POST', url: '/api/runs', headers: { 'content-type': 'application/json' } });
  expect(res.statusCode).toBe(202);
  await orchestrator.wait(res.json().run_id);
});

test('POST /api/moves/:id/decision', async () => {
  const { app } = await withRun();
  const ok = await app.inject(post('/api/moves/m001/decision', { decision: 'approve' }));
  expect(ok.statusCode).toBe(200);
  expect(ok.json().status).toBe('approved');
  expect((await app.inject(post('/api/moves/m001/decision', { decision: 'maybe' }))).statusCode).toBe(400);
  expect((await app.inject(post('/api/moves/m999/decision', { decision: 'approve' }))).statusCode).toBe(404);
});

test('serves the web build when webDir is given, API untouched', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'web-'));
  writeFileSync(join(dir, 'index.html'), '<div id="root"></div>');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
  const orchestrator = createOrchestrator({ llm, sql: mockSql, logsDir: mkdtempSync(join(tmpdir(), 'rt-')) });
  const app = buildServer({ orchestrator, checks: { zetaris: async () => false, nightshift: async () => 'online' }, webDir: dir });
  expect((await app.inject({ url: '/' })).body).toContain('id="root"');
  expect((await app.inject({ url: '/assets/app.js' })).headers['content-type']).toMatch(/javascript/);
  expect((await app.inject({ url: '/api/health' })).json().ok).toBe(true);
  expect((await app.inject({ url: '/api/nope' })).json().error.code).toBe('not_found');
});
