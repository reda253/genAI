import { describe, expect, it } from 'vitest';
import { cfo } from '../src/agents/cfo.ts';
import { baselineForecast, explanation, findings } from '../src/agents/fixtures.ts';
import type { AgentContext } from '../src/agents/types.ts';
import { fakeLlm, scriptedLlm } from './helpers.ts';

describe('cfo agent', () => {
  it('generates a Morning Brief with exactly 3 ranked moves', async () => {
    const ctx: AgentContext = {
      runId: 'run_test_cfo_001',
      llm: fakeLlm,
      sql: () => Promise.reject(new Error('no sql')),
      trace: () => {},
    };

    const brief = await cfo(ctx, {
      findings,
      forecast: baselineForecast,
      explanation,
    });

    expect(brief.run_id).toBe('run_test_cfo_001');
    expect(brief.moves).toHaveLength(3);
    expect(brief.moves[0].rank).toBe(1);
    expect(brief.moves[1].rank).toBe(2);
    expect(brief.moves[2].rank).toBe(3);

    for (const move of brief.moves) {
      expect(['bill_hours', 'send_reminder', 'cancel_subscription', 'dispute_charge', 'raise_rate']).toContain(move.action_type);
      expect(['high', 'medium', 'low']).toContain(move.urgency);
      expect(move.status).toBe('pending');
      expect(move.finding_ids.length).toBeGreaterThan(0);
    }
  });

  const llmBrief = (moves: object[]) => JSON.stringify({ what_changed: ['x'], moves, cash_today: 1 });
  const move = (finding: string, extra = {}) => ({
    id: 'zz', rank: 9, title: `Act on ${finding}`, action_type: 'bill_hours', monthly_impact_eur: 99999,
    urgency: 'high', reason: 'r', finding_ids: [finding], memory_note: 'x', status: 'approved', ...extra,
  });
  const ctxWith = (llm: AgentContext['llm']): AgentContext =>
    ({ runId: 'run_cfo', llm, deepModel: 'deep-x', sql: () => Promise.reject(new Error('no')), trace: () => {} });

  it('uses the deep model and grounds model moves in real findings', async () => {
    const { llm, calls } = scriptedLlm(llmBrief([move('f002'), move('f001', { action_type: 'send_reminder' }), move('f004')]));
    const brief = await cfo(ctxWith(llm), { findings, forecast: baselineForecast, explanation });
    expect(calls[0]?.model).toBe('deep-x');
    expect(brief.moves.map(m => m.id)).toEqual(['m001', 'm002', 'm003']);
    expect(brief.moves.map(m => m.rank)).toEqual([1, 2, 3]);
    expect(brief.moves.every(m => m.status === 'pending' && m.memory_note === null)).toBe(true);
    expect(brief.moves[0].monthly_impact_eur).toBe(1320); // from finding f002, not the model's 99999
    expect(brief.moves[0].title).toBe('Act on f002'); // model wording kept
    expect(brief.cash_today).toBe(baselineForecast.start_balance); // never the model's number
  });

  it('rejects model moves that cite unknown findings and falls back to ranking', async () => {
    const { llm } = scriptedLlm(llmBrief([move('f002'), move('f999'), move('f004')]));
    const brief = await cfo(ctxWith(llm), { findings, forecast: baselineForecast, explanation });
    const ids = new Set(findings.map(f => f.id));
    expect(brief.moves).toHaveLength(3);
    brief.moves.forEach(m => m.finding_ids.forEach(id => expect(ids.has(id)).toBe(true)));
    expect(brief.moves.some(m => m.title === 'Act on f002')).toBe(false); // whole model answer discarded
  });

  it('G1: critiques model moves citing unknown finding, accepts valid revised moves', async () => {
    const replies = [
      llmBrief([move('f002'), move('f999'), move('f004')]), // f999 is unknown
      llmBrief([move('f002'), move('f001', { action_type: 'send_reminder' }), move('f004')]), // revised valid
    ];
    const { llm } = scriptedLlm(() => replies.shift()!);
    const events: { event: string; data?: any }[] = [];
    const brief = await cfo(
      { runId: 'run_cfo', llm, deepModel: 'deep-x', sql: () => Promise.reject(new Error('no')), trace: (event, data) => events.push({ event, data }) },
      { findings, forecast: baselineForecast, explanation }
    );

    expect(brief.moves).toHaveLength(3);
    expect(brief.moves.some(m => m.title === 'Act on f001')).toBe(true);
    const critique = events.find(e => e.event === 'critique');
    expect(critique).toBeDefined();
    expect(critique?.data).toMatchObject({ agent: 'cfo', revised: true });
  });

  it('G1: critiques invalid moves, falls back to backup ranking when revision also fails', async () => {
    const replies = [
      llmBrief([move('f999')]), // bad count and bad id
      llmBrief([move('f999')]), // still bad
    ];
    const { llm } = scriptedLlm(() => replies.shift()!);
    const events: { event: string; data?: any }[] = [];
    const brief = await cfo(
      { runId: 'run_cfo', llm, deepModel: 'deep-x', sql: () => Promise.reject(new Error('no')), trace: (event, data) => events.push({ event, data }) },
      { findings, forecast: baselineForecast, explanation }
    );

    expect(brief.moves).toHaveLength(3);
    const critique = events.find(e => e.event === 'critique');
    expect(critique).toBeDefined();
    expect(critique?.data).toMatchObject({ agent: 'cfo', revised: false });
  });
});
