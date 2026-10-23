// STUB (P5 replaces): causes with amounts and evidence, no number outside the evidence rows.
import type { AgentContext, Explanation, Finding } from './types.ts';
import { explanation } from './fixtures.ts';

export async function explainer(
  _ctx: AgentContext,
  input: { question: string; finding_id: string | null; findings: Finding[] },
): Promise<Explanation> {
  return { ...structuredClone(explanation), question: input.question };
}
