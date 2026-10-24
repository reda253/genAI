import { describe, expect, it } from 'vitest';
import { loadPrompt } from '../src/agents/prompts.ts';

describe('loadPrompt', () => {
  it('reads each agent system prompt from prompts/*.md', () => {
    expect(loadPrompt('leak_hunter')).toMatch(/Leak Hunter/);
    expect(loadPrompt('explainer')).toMatch(/Explainer/);
    expect(loadPrompt('cfo_rank')).toMatch(/exactly 3 moves/);
  });
});
