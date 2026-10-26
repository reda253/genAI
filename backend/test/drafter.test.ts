import { describe, expect, it } from 'vitest';
import { defaultDraftFor, drafter, extractAllowedNumbers, extractNumbersFromText } from '../src/agents/drafter.ts';
import { findings, moves } from '../src/agents/fixtures.ts';
import type { AgentContext } from '../src/agents/types.ts';
import { fakeLlm, scriptedLlm } from './helpers.ts';

describe('drafter agent (I2 Action drafts)', () => {
  const moveReminder = moves[1]; // send_reminder for Nordwind Studio (c04)
  const moveBilling = moves[0]; // bill_hours for Atlas Co (c01)
  const moveCancel = moves[2]; // cancel_subscription for Webflow (sub05)

  it('extracts numbers accurately from evidence and findings', () => {
    const allowed = extractAllowedNumbers(moveBilling, findings);
    expect(allowed.has(1320)).toBe(true);
    expect(allowed.has(99999)).toBe(false);
  });

  it('extracts numbers from draft text', () => {
    const text = 'Invoice inv0031 of 2400.00 EUR is 47 days late.';
    const nums = extractNumbersFromText(text);
    expect(nums).toContain(2400);
    expect(nums).toContain(47);
  });

  it('returns default template when Nightshift is offline', async () => {
    const ctx: AgentContext = {
      runId: 'r',
      llm: fakeLlm,
      sql: () => Promise.reject(new Error('no')),
      trace: () => {},
    };

    const draft = await drafter({ move: moveReminder, findings, ctx });
    expect(draft.move_id).toBe(moveReminder.id);
    expect(draft.kind).toBe('email');
    expect(draft.subject).toMatch(/Payment Reminder/);
    expect(draft.body).toMatch(/4800/);
    expect(draft.ungrounded).toHaveLength(0);
  });

  it('accepts a grounded model reply citing numbers present in evidence', async () => {
    const modelReply = JSON.stringify({
      kind: 'email',
      subject: 'Reminder regarding invoice inv0031 (4800 EUR)',
      body: 'Dear Nordwind Studio, invoice inv0031 for 4800 EUR is 47 days late. Please arrange payment.',
    });
    const { llm } = scriptedLlm(modelReply);
    const ctx: AgentContext = {
      runId: 'r',
      llm,
      deepModel: 'deep-x',
      sql: () => Promise.reject(new Error('no')),
      trace: () => {},
    };

    const draft = await drafter({ move: moveReminder, findings, ctx });
    expect(draft.kind).toBe('email');
    expect(draft.subject).toBe('Reminder regarding invoice inv0031 (4800 EUR)');
    expect(draft.body).toMatch(/4800 EUR/);
    expect(draft.ungrounded).toHaveLength(0);
  });

  it('G1: critiques an invented amount and accepts revised grounded draft', async () => {
    const replies = [
      JSON.stringify({
        kind: 'email',
        subject: 'Reminder: 99999 EUR overdue',
        body: 'You owe 99999 EUR immediately.',
      }),
      JSON.stringify({
        kind: 'email',
        subject: 'Reminder: 4800 EUR overdue',
        body: 'Invoice inv0031 for 4800 EUR is overdue by 47 days.',
      }),
    ];
    const { llm } = scriptedLlm(() => replies.shift()!);
    const events: { event: string; data?: any }[] = [];
    const ctx: AgentContext = {
      runId: 'r',
      llm,
      deepModel: 'deep-x',
      sql: () => Promise.reject(new Error('no')),
      trace: (event, data) => events.push({ event, data }),
    };

    const draft = await drafter({ move: moveReminder, findings, ctx });
    expect(draft.subject).toBe('Reminder: 4800 EUR overdue');
    const critique = events.find(e => e.event === 'critique');
    expect(critique).toBeDefined();
    expect(critique?.data).toMatchObject({ agent: 'cfo', revised: true });
  });

  it('falls back to default template when model persistently invents amounts', async () => {
    const replies = [
      JSON.stringify({ kind: 'email', subject: 'X', body: 'Pay 88888 EUR' }),
      JSON.stringify({ kind: 'email', subject: 'Y', body: 'Still pay 88888 EUR' }),
    ];
    const { llm } = scriptedLlm(() => replies.shift()!);
    const events: { event: string; data?: any }[] = [];
    const ctx: AgentContext = {
      runId: 'r',
      llm,
      deepModel: 'deep-x',
      sql: () => Promise.reject(new Error('no')),
      trace: (event, data) => events.push({ event, data }),
    };

    const draft = await drafter({ move: moveReminder, findings, ctx });
    const template = defaultDraftFor(moveReminder, findings);
    expect(draft.body).toBe(template.body);
    const critique = events.find(e => e.event === 'critique');
    expect(critique?.data).toMatchObject({ agent: 'cfo', revised: false });
  });

  it('generates steps draft for cancel_subscription move', () => {
    const draft = defaultDraftFor(moveCancel, findings);
    expect(draft.kind).toBe('steps');
    expect(draft.subject).toBeNull();
    expect(draft.body).toMatch(/Cancel Subscription/);
  });
});
