import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOrchestrator, NoRunYetError, NotFoundError, RunInProgressError } from '../src/agents/orchestrator.ts';
import type { Llm } from '../src/agents/types.ts';
import { mockSql, scriptedLlm } from './helpers.ts';
import { ENTITY_SQL } from '../src/zetaris/entitySql.ts';

const nope = () => Promise.reject(new Error('llm not used by stubs'));
export const fakeLlm: Llm = { chat: nope, generate: nope, listModels: nope };

function make(agents = {}) {
  const logsDir = mkdtempSync(join(tmpdir(), 'orch-'));
  return { logsDir, o: createOrchestrator({ llm: fakeLlm, sql: mockSql, logsDir, agents }) };
}

test('agents receive the deep model id', async () => {
  let seen: string | undefined;
  const logsDir = mkdtempSync(join(tmpdir(), 'orch-'));
  const o = createOrchestrator({
    llm: fakeLlm, sql: mockSql, logsDir, deepModel: 'deep-x',
    agents: { leakHunter: async ctx => { seen = ctx.deepModel; return []; } },
  });
  await o.wait(o.startRun().run_id);
  expect(seen).toBe('deep-x');
});

test('run completes and stores latest', async () => {
  const { o } = make();
  const s = o.startRun();
  expect(s.status).toBe('running');
  expect(s.run_id).toMatch(/^run_\d{8}_\d{6}$/);
  expect(await o.wait(s.run_id)).toMatchObject({ status: 'done', step: null, error: null });
  expect(o.latest().brief.moves).toHaveLength(3);
  expect(o.latest().findings).toHaveLength(6);
});

test('trace has start/done for 4 steps', async () => {
  const { o, logsDir } = make();
  const { run_id } = o.startRun();
  await o.wait(run_id);
  const lines = readFileSync(join(logsDir, `${run_id}.jsonl`), 'utf8').trim().split('\n').map(l => JSON.parse(l))
    .filter(l => l.event === 'start' || l.event === 'done'); // agents may also trace e.g. llm_failed
  expect(lines.map(l => `${l.step}:${l.event}`)).toEqual([
    'leak_hunter:start', 'leak_hunter:done', 'explainer:start', 'explainer:done',
    'forecaster:start', 'forecaster:done', 'cfo:start', 'cfo:done',
  ]);
});

test('world model ingest traces the entity count from full view rows', async () => {
  const { o, logsDir } = make();
  const { run_id } = o.startRun();
  await o.wait(run_id);
  const lines = readFileSync(join(logsDir, `${run_id}.jsonl`), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const ingested = lines.find(l => l.event === 'world_model_ingested');
  expect(ingested).toBeDefined();
  expect(ingested.step).toBe('leak_hunter');
  expect(ingested.data.entities).toBe(79);
});

test('a failed world model ingest is traced and the run still finishes', async () => {
  const logsDir = mkdtempSync(join(tmpdir(), 'orch-'));
  const entityQueries = new Set<string>(Object.values(ENTITY_SQL));
  const sql = (q: string) => entityQueries.has(q) ? Promise.reject(new Error('view down')) : mockSql(q);
  const o = createOrchestrator({ llm: fakeLlm, sql, logsDir });
  const { run_id } = o.startRun();
  expect((await o.wait(run_id)).status).toBe('done');
  const lines = readFileSync(join(logsDir, `${run_id}.jsonl`), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  expect(lines.find(l => l.event === 'world_model_failed')).toMatchObject({ step: 'leak_hunter', data: { error: 'view down' } });
});

test('second start while running throws RunInProgressError', async () => {
  const { o } = make();
  const { run_id } = o.startRun();
  const err = (() => { try { o.startRun(); } catch (e) { return e; } })();
  expect(err).toBeInstanceOf(RunInProgressError);
  expect((err as RunInProgressError).runId).toBe(run_id);
  await o.wait(run_id);
});

test('failing agent fails the run', async () => {
  const { o } = make({ explainer: () => Promise.reject(new Error('nightshift down')) });
  const { run_id } = o.startRun();
  expect(await o.wait(run_id)).toMatchObject({ status: 'failed', step: 'explainer', error: 'nightshift down' });
  expect(() => o.latest()).toThrow(NoRunYetError);
  expect(o.startRun().status).toBe('running');
});

test('latest, explain and whatIf before any run throw NoRunYetError', async () => {
  const { o } = make();
  expect(() => o.latest()).toThrow(NoRunYetError);
  await expect(o.explain('why?', null)).rejects.toBeInstanceOf(NoRunYetError);
  await expect(o.whatIf({ type: 'raise_prices', pct: 10 })).rejects.toBeInstanceOf(NoRunYetError);
});

test('decide updates and can be changed', async () => {
  const { o } = make();
  await o.wait(o.startRun().run_id);
  expect(o.decide('m001', 'approve', null).status).toBe('approved');
  expect(o.decide('m001', 'reject', 'no').status).toBe('rejected');
  expect(o.latest().brief.moves[0].status).toBe('rejected');
  expect(() => o.decide('m999', 'approve', null)).toThrow(NotFoundError);
});

test('whatIf lose_client lowers balances', async () => {
  const { o } = make();
  await o.wait(o.startRun().run_id);
  const scenario = { type: 'lose_client', client_id: 'c01' } as const;
  const r = await o.whatIf(scenario);
  expect(r.scenario.months[5].balance).toBeLessThan(r.baseline.months[5].balance);
  expect(r.scenario.scenario).toEqual(scenario);
});

test('unwritable logs dir fails the run instead of crashing, and frees the slot', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'orch-')), 'not-a-dir');
  writeFileSync(file, 'x');
  const o = createOrchestrator({ llm: fakeLlm, sql: nope, logsDir: file });
  const { run_id } = o.startRun();
  expect(await o.wait(run_id)).toMatchObject({ status: 'failed' });
  expect(() => o.startRun()).not.toThrow(RunInProgressError);
});

test('getRun unknown id throws NotFoundError', () => {
  expect(() => make().o.getRun('run_nope')).toThrow(NotFoundError);
});

const readTrace = (logsDir: string, runId: string) =>
  readFileSync(join(logsDir, `${runId}.jsonl`), 'utf8').trim().split('\n').map(l => JSON.parse(l));

test('every model call is traced with its model, time and outcome, engines included', async () => {
  const logsDir = mkdtempSync(join(tmpdir(), 'orch-'));
  const { llm } = scriptedLlm('not json');
  const o = createOrchestrator({ llm, sql: mockSql, logsDir, model: 'fast-x', deepModel: 'deep-x' });
  const { run_id } = o.startRun();
  await o.wait(run_id);
  const calls = readTrace(logsDir, run_id).filter(l => l.event === 'llm_call');
  expect(calls.find(l => l.step === 'leak_hunter')?.data).toMatchObject({ model: 'fast-x', ok: true });
  expect(calls.find(l => l.step === 'cfo')?.data).toMatchObject({ model: 'deep-x', ok: true });
  expect(calls.some(l => l.step === 'explainer')).toBe(true); // Markovian engine calls llm.generate
  expect(calls.every(l => typeof l.data.ms === 'number')).toBe(true);
});

test('a failed model call is traced with ok:false', async () => {
  const { o, logsDir } = make();
  const { run_id } = o.startRun();
  await o.wait(run_id);
  const calls = readTrace(logsDir, run_id).filter(l => l.event === 'llm_call');
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every(l => l.data.ok === false && l.data.model === 'default')).toBe(true);
});

test('leak hunter traces checks_done, cfo traces memory_applied', async () => {
  const { o, logsDir } = make();
  const { run_id } = o.startRun();
  await o.wait(run_id);
  const lines = readTrace(logsDir, run_id);
  expect(lines.find(l => l.event === 'checks_done')).toMatchObject({ step: 'leak_hunter', data: { ran: 6, failed: 0 } });
  expect(lines.find(l => l.event === 'memory_applied')).toMatchObject({ step: 'cfo', data: { count: 0 } });
});

test('trace(runId) returns the run lines; unknown or unsafe ids are not found', async () => {
  const { o } = make();
  const { run_id } = o.startRun();
  await o.wait(run_id);
  expect(o.trace(run_id)[0]).toMatchObject({ run_id, step: 'leak_hunter', event: 'start' });
  expect(() => o.trace('run_20990101_000000')).toThrow(NotFoundError);
  expect(() => o.trace('../package')).toThrow(NotFoundError);
});

test('changes(): first run has no previous; second run diffs against the saved first run', async () => {
  const logsDir = mkdtempSync(join(tmpdir(), 'orch-'));
  let t = Date.parse('2026-10-26T09:00:00Z');
  let dropPriceRise = false;
  const sql = async (q: string) => {
    const r = await mockSql(q);
    return dropPriceRise && q.includes('price_change_pct > 15') ? { ...r, rows: [] } : r;
  };
  const make2 = () => createOrchestrator({ llm: fakeLlm, sql, logsDir, now: () => new Date(t += 60_000) });

  const o1 = make2();
  const first = o1.startRun().run_id;
  await o1.wait(first);
  expect(o1.changes()).toMatchObject({ previous_run_id: null, resolved: [], changed: [] });
  expect(o1.changes().new).toHaveLength(6);

  dropPriceRise = true;
  const o2 = make2(); // a restarted backend still finds the previous run on disk
  const second = o2.startRun().run_id;
  await o2.wait(second);
  const c = o2.changes();
  expect(c.previous_run_id).toBe(first);
  expect(c.new).toEqual([]);
  expect(c.resolved.map(x => x.type)).toEqual(['price_rise']);
  expect(o2.latest().brief.what_changed[0]).toMatch(/^Resolved: /);
});

test('changes() before any run is empty, not an error', () => {
  const { o } = make();
  expect(o.changes()).toEqual({ previous_run_id: null, new: [], resolved: [], changed: [] });
});
