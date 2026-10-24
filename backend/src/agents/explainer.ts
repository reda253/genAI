// STUB (P5 replaces): causes with amounts and evidence, no number outside the evidence rows.
import type { AgentContext, Explanation, Finding } from './types.ts';
import { explanation } from './fixtures.ts';
import { runExplainerInvestigation } from '../engines/markovianAdapter.ts';

export async function explainer(
  ctx: AgentContext,
  input: { question: string; finding_id: string | null; findings: Finding[] },
): Promise<Explanation> {
  if (ctx.engines?.markovian) {
    try {
      const inv = await runExplainerInvestigation(ctx.engines.markovian, {
        question: input.question,
        findingId: input.finding_id,
        findings: input.findings,
        generator: prompt => ctx.llm.generate(prompt),
      });
      return inv.explanation;
    } catch {
      // Graceful fallback when LLM is unavailable in tests or offline
    }
  }
  return { ...structuredClone(explanation), question: input.question };
}
