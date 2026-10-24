// STUB (P5 replaces): top 3 moves ranked by money impact and urgency; P4 adds H-MEM memories.
import type { AgentContext, Brief, Explanation, Finding, Forecast } from './types.ts';
import { briefFor } from './fixtures.ts';
import { applyMemoriesToMoves } from '../engines/hmemAdapter.ts';

export async function cfo(
  ctx: AgentContext,
  input: { findings: Finding[]; forecast: Forecast; explanation: Explanation },
): Promise<Brief> {
  const brief = briefFor(ctx.runId, new Date().toISOString());
  if (ctx.engines?.hmem) {
    brief.moves = applyMemoriesToMoves(ctx.engines.hmem, brief.moves);
  }
  return { ...brief, findings_count: input.findings.length };
}
