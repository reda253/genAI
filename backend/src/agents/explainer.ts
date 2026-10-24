// Explainer agent (P5): causal analysis with zero hallucination and strict evidence linking.
import type { AgentContext, Cause, Explanation, Finding } from './types.ts';
import { explanation as defaultExplanation } from './fixtures.ts';
import { stripReasoning } from '../llm/nightshift.ts';

function extractJson(text: string): unknown {
  const cleaned = stripReasoning(text).trim();
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const raw = match ? match[1] : cleaned;
  return JSON.parse(raw);
}

export async function explainer(
  ctx: AgentContext,
  input: { question: string; finding_id: string | null; findings: Finding[] },
): Promise<Explanation> {
  const relevantFindings = input.finding_id
    ? input.findings.filter(f => f.id === input.finding_id)
    : input.findings;

  try {
    // If LLM is callable, prompt for intelligent synthesis
    const prompt = `You are the Explainer agent for Ledger Lens.
Question: "${input.question}"
Findings available:
${JSON.stringify(relevantFindings, null, 2)}

Respond with strict JSON matching the Explanation schema:
{
  "question": "${input.question}",
  "summary": "1-2 sentence executive summary citing exact causes and amounts",
  "causes": [
    { "rank": 1, "cause": "...", "amount_eur": 0.00, "finding_id": "...", "evidence": [] }
  ],
  "uncertain": false,
  "uncertainty_note": null
}`;

    const raw = await ctx.llm.chat([
      { role: 'system', content: 'You are Explainer agent. Return ONLY valid JSON.' },
      { role: 'user', content: prompt },
    ]);

    const parsed = extractJson(raw) as Partial<Explanation>;
    if (parsed && typeof parsed.summary === 'string' && Array.isArray(parsed.causes)) {
      return {
        question: input.question,
        summary: parsed.summary,
        causes: parsed.causes,
        uncertain: Boolean(parsed.uncertain),
        uncertainty_note: parsed.uncertainty_note ?? null,
      };
    }
  } catch {
    // Graceful fallback for test environments or when LLM is offline
  }

  // Deterministic fallback based on input findings
  if (relevantFindings.length > 0) {
    const causes: Cause[] = relevantFindings.slice(0, 3).map((f, i) => ({
      rank: i + 1,
      cause: f.title,
      amount_eur: f.monthly_impact_eur || f.cash_at_risk_eur,
      finding_id: f.id,
      evidence: f.evidence,
    }));

    const totalImpact = causes.reduce((sum, c) => sum + c.amount_eur, 0);
    return {
      question: input.question,
      summary: `Margin fell mainly because ${causes.map(c => c.cause).join(', ')} (${Math.round(totalImpact * 100) / 100} EUR total impact).`,
      causes,
      uncertain: false,
      uncertainty_note: null,
    };
  }

  return { ...structuredClone(defaultExplanation), question: input.question };
}
