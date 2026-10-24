import { describe, expect, it } from 'vitest';
import { explainer } from '../src/agents/explainer.ts';
import { findings } from '../src/agents/fixtures.ts';
import type { AgentContext } from '../src/agents/types.ts';
import { fakeLlm } from './orchestrator.test.ts';

describe('explainer agent', () => {
  it('explains financial drop with causes referencing evidence', async () => {
    const ctx: AgentContext = {
      runId: 'run_test_explainer',
      llm: fakeLlm,
      sql: () => Promise.reject(new Error('no sql')),
      trace: () => {},
    };

    const result = await explainer(ctx, {
      question: 'Why did my margin drop in September?',
      finding_id: null,
      findings,
    });

    expect(result.question).toBe('Why did my margin drop in September?');
    expect(result.causes.length).toBeGreaterThan(0);
    expect(result.causes[0].rank).toBe(1);
    expect(result.causes[0].evidence).toBeDefined();
    expect(result.uncertain).toBe(false);
  });

  it('filters explanation when finding_id is provided', async () => {
    const ctx: AgentContext = {
      runId: 'run_test_explainer_single',
      llm: fakeLlm,
      sql: () => Promise.reject(new Error('no sql')),
      trace: () => {},
    };

    const result = await explainer(ctx, {
      question: 'Explain this specific unbilled hours issue',
      finding_id: 'f002',
      findings,
    });

    expect(result.causes).toHaveLength(1);
    expect(result.causes[0].finding_id).toBe('f002');
  });
});
