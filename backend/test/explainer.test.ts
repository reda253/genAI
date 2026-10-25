import { describe, expect, it } from 'vitest';
import { explainer, extractJson } from '../src/agents/explainer.ts';
import { findings } from '../src/agents/fixtures.ts';
import type { AgentContext } from '../src/agents/types.ts';
import { fakeLlm, scriptedLlm } from './helpers.ts';

describe('extractJson', () => {
  it('finds the JSON after reasoning prose that has no </think> tag', () => {
    const raw = 'We need to rank the causes {by impact}. Let me think.\n{"summary": "s", "causes": [{"rank": 1}]}';
    expect(extractJson(raw)).toEqual({ summary: 's', causes: [{ rank: 1 }] });
  });
  it('still reads fenced JSON and plain JSON', () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(extractJson('{"a": 2}')).toEqual({ a: 2 });
  });
  it('throws when there is no JSON at all', () => {
    expect(() => extractJson('We need to think about this')).toThrow();
  });
});

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

  it('uses the deep model and attaches each cause evidence from its finding', async () => {
    const { llm, calls } = scriptedLlm(JSON.stringify({
      summary: 'Unbilled Atlas hours drove the drop.',
      causes: [
        { rank: 1, cause: 'Atlas hours not invoiced', amount_eur: 1320, finding_id: 'f002', evidence: [] },
        { rank: 2, cause: 'Made-up cause', amount_eur: 999, finding_id: 'f999', evidence: [] },
      ],
      uncertain: false, uncertainty_note: null,
    }));
    const result = await explainer({ runId: 'r', llm, deepModel: 'deep-x', sql: () => Promise.reject(new Error('no')), trace: () => {} },
      { question: 'Why?', finding_id: null, findings });

    expect(calls[0]?.model).toBe('deep-x');
    expect(result.causes).toHaveLength(1); // f999 does not exist: dropped
    expect(result.causes[0]).toMatchObject({ rank: 1, finding_id: 'f002', amount_eur: 1320 });
    expect(result.causes[0].evidence).toEqual(findings[1].evidence);
    expect(result.uncertain).toBe(false);
  });

  it('marks the explanation uncertain when an amount is not in the evidence', async () => {
    const { llm } = scriptedLlm(JSON.stringify({
      summary: 's', causes: [{ rank: 1, cause: 'c', amount_eur: 4242, finding_id: 'f002' }], uncertain: false,
    }));
    const result = await explainer({ runId: 'r', llm, sql: () => Promise.reject(new Error('no')), trace: () => {} },
      { question: 'Why?', finding_id: null, findings });
    expect(result.uncertain).toBe(true);
    expect(result.uncertainty_note).toMatch(/4242/);
  });

  it('traces a model failure and falls back to causes built from the findings', async () => {
    const events: { event: string; data?: unknown }[] = [];
    const result = await explainer(
      { runId: 'r', llm: fakeLlm, sql: () => Promise.reject(new Error('no')), trace: (event, data) => { events.push({ event, data }); } },
      { question: 'Why?', finding_id: null, findings });
    expect(events.map(e => e.event)).toContain('llm_failed');
    expect(result.causes.every(c => c.evidence.length > 0)).toBe(true);
  });

  // Like the real engine: one generator call per chunk; the adapter keeps the model's raw reply.
  const fakeMarkovian = () => {
    const prompts: string[] = [];
    const markovian = {
      async run(opts: { prompt: string; generator?: (p: string) => Promise<{ text: string }> }) {
        prompts.push(opts.prompt);
        const { text } = (await opts.generator?.('chunk')) ?? { text: '' };
        return { output: text.split('[STATE_CHECKPOINT]')[0], chunks: [{}], totalTokensUsed: 10 };
      },
    } as unknown as NonNullable<AgentContext['engines']>['markovian'];
    return { markovian, prompts };
  };

  it('uses the Markovian investigation answer, grounded, on the deep model', async () => {
    const { markovian, prompts } = fakeMarkovian();
    const { llm, calls } = scriptedLlm('>> chunk 1\n[STATE_CHECKPOINT]\nCOMPLETED: f002\n[TASK_COMPLETE]\n' +
      '{"summary": "Atlas hours drove it.", "causes": [{"rank": 1, "cause": "Atlas", "amount_eur": 1320, "finding_id": "f002"}], "uncertain": false}');
    const events: string[] = [];
    const result = await explainer(
      { runId: 'r', llm, deepModel: 'deep-x', sql: () => Promise.reject(new Error('no')), trace: e => { events.push(e); },
        engines: { markovian } as AgentContext['engines'] },
      { question: 'Why?', finding_id: null, findings });
    expect(result.summary).toBe('Atlas hours drove it.');
    expect(result.causes[0].evidence).toEqual(findings[1].evidence);
    expect(calls[0]?.model).toBe('deep-x'); // the Markovian chunk generator runs on the deep lane
    expect(prompts[0]).toMatch(/JSON/);
    expect(events).toContain('markovian_done');
  });

  it('falls back to a direct model call when the Markovian answer has no grounded cause', async () => {
    const { markovian } = fakeMarkovian();
    const replies = ['I could not decide.', JSON.stringify({
      summary: 'Direct answer.', causes: [{ rank: 1, cause: 'c', amount_eur: 1320, finding_id: 'f002' }], uncertain: false,
    })];
    const { llm } = scriptedLlm(() => replies.shift()!); // 1st call = Markovian chunk, 2nd = direct call
    const events: string[] = [];
    const result = await explainer(
      { runId: 'r', llm, sql: () => Promise.reject(new Error('no')), trace: e => { events.push(e); },
        engines: { markovian } as AgentContext['engines'] },
      { question: 'Why?', finding_id: null, findings });
    expect(result.summary).toBe('Direct answer.');
    expect(events).toContain('llm_rejected');
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

  it('G1: critiques ungrounded amounts and accepts revised grounded answer', async () => {
    const replies = [
      JSON.stringify({
        summary: 'First try.',
        causes: [{ rank: 1, cause: 'Unbilled Atlas', amount_eur: 99999, finding_id: 'f002' }],
        uncertain: false,
      }),
      JSON.stringify({
        summary: 'Revised try.',
        causes: [{ rank: 1, cause: 'Unbilled Atlas', amount_eur: 1320, finding_id: 'f002' }],
        uncertain: false,
      }),
    ];
    const { llm } = scriptedLlm(() => replies.shift()!);
    const events: { event: string; data?: any }[] = [];
    const result = await explainer(
      { runId: 'r', llm, deepModel: 'deep-x', sql: () => Promise.reject(new Error('no')), trace: (event, data) => events.push({ event, data }) },
      { question: 'Why?', finding_id: null, findings }
    );

    expect(result.summary).toBe('Revised try.');
    expect(result.uncertain).toBe(false);
    expect(result.causes[0].amount_eur).toBe(1320);
    const critique = events.find(e => e.event === 'critique');
    expect(critique).toBeDefined();
    expect(critique?.data).toMatchObject({ agent: 'explainer', revised: true });
    expect(critique?.data.problems[0]).toMatch(/99999/);
  });
});
