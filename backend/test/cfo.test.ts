import { describe, expect, it } from 'vitest';
import { cfo } from '../src/agents/cfo.ts';
import { baselineForecast, explanation, findings } from '../src/agents/fixtures.ts';
import type { AgentContext } from '../src/agents/types.ts';
import { fakeLlm } from './orchestrator.test.ts';

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
});
