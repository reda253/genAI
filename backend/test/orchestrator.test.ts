import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOrchestrator, NoRunYetError, NotFoundError, RunInProgressError } from '../src/agents/orchestrator.ts';
import type { Llm } from '../src/agents/types.ts';
import { mockSql } from './helpers.ts';

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
