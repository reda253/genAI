// Explainer agent (P5 & P4): causal analysis with zero hallucination, evidence linking, Markovian bounded reasoning, and G1 critic-revision loop.
import type { AgentContext, Cause, ChatMessage, Explanation, Finding } from './types.ts';
import { stripReasoning } from '../llm/nightshift.ts';
import { runExplainerInvestigation } from '../engines/markovianAdapter.ts';
import { loadPrompt } from './prompts.ts';

/**
 * The model's JSON answer. Nemotron Ultra sometimes writes its reasoning into the reply without a
 * </think> tag, so if the whole text isn't JSON, take the earliest '{' whose slice to the last '}' parses.
 */
export function extractJson(text: string): unknown {
  const cleaned = stripReasoning(text).trim();
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const raw = match ? match[1] : cleaned;
  try {
    return JSON.parse(raw);
  } catch (e) {
    const end = raw.lastIndexOf('}');
    for (let i = raw.indexOf('{'); i !== -1 && i < end; i = raw.indexOf('{', i + 1)) {
      try { return JSON.parse(raw.slice(i, end + 1)); } catch { /* try the next '{' */ }
    }
    throw e;
  }
}

/** Every number a finding can justify: its impacts plus every numeric cell of its evidence rows. */
function groundedAmounts(f: Finding): Set<number> {
  const nums = new Set([f.monthly_impact_eur, f.cash_at_risk_eur].map(n => Math.round(n * 100) / 100));
  for (const e of f.evidence) for (const row of e.rows) for (const v of Object.values(row)) {
    if (typeof v === 'number') nums.add(Math.round(v * 100) / 100);
  }
  return nums;
}

/** Keep only causes that cite a real finding; take evidence from that finding, never from the model. */
export function groundCauses(raw: unknown, findings: Finding[]): { causes: Cause[]; ungrounded: number[] } {
  const byId = new Map(findings.map(f => [f.id, f]));
  const ungrounded: number[] = [];
  const causes = (Array.isArray(raw) ? raw : [])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && byId.has(String(c.finding_id)))
    .map((c, i) => {
      const f = byId.get(String(c.finding_id))!;
      const amount = Number(c.amount_eur);
      if (!Number.isFinite(amount) || !groundedAmounts(f).has(Math.round(amount * 100) / 100)) ungrounded.push(amount);
      return { rank: i + 1, cause: String(c.cause ?? f.title), amount_eur: amount, finding_id: f.id, evidence: f.evidence };
    });
  return { causes, ungrounded };
}

/** Not in any evidence row: the demo switch puts it in the model's first answer for the critic to catch. */
export const DEMO_INVENTED_AMOUNT = 3170.45;

/**
 * DEMO_CRITIC=1 only: replaces the first cause's amount with an invented one, so a demo can show the
 * G1 critic catching it and the model revising. The trace marks it as injected; off by default.
 */
export function injectDemoAmount(raw: string): string {
  try {
    const parsed = extractJson(raw) as { causes?: { amount_eur?: unknown }[] };
    if (!Array.isArray(parsed?.causes) || !parsed.causes.length) return raw;
    parsed.causes[0].amount_eur = DEMO_INVENTED_AMOUNT;
    return JSON.stringify(parsed);
  } catch {
    return raw;
  }
}

export async function explainer(
  ctx: AgentContext,
  input: { question: string; finding_id: string | null; findings: Finding[] },
): Promise<Explanation> {
  const relevantFindings = input.finding_id
    ? input.findings.filter(f => f.id === input.finding_id)
    : input.findings;

  /** Parse a model answer and return its structure and ungrounded amounts. */
  const parseAnswer = (raw: string): { explanation: Explanation | null; ungrounded: number[] } => {
    let parsed: Partial<Explanation>;
    try { parsed = extractJson(raw) as Partial<Explanation>; } catch { return { explanation: null, ungrounded: [] }; }
    const { causes, ungrounded } = groundCauses(parsed?.causes, relevantFindings);
    if (typeof parsed?.summary !== 'string' || causes.length === 0) return { explanation: null, ungrounded };
    const uncertain = Boolean(parsed.uncertain) || ungrounded.length > 0;
    const note = ungrounded.length > 0
      ? `Amounts not found in the evidence rows: ${ungrounded.join(', ')} EUR.`
      : parsed.uncertainty_note ?? null;
    return {
      explanation: { question: input.question, summary: parsed.summary, causes, uncertain, uncertainty_note: uncertain ? note : null },
      ungrounded,
    };
  };

  /** G1: One critique-revise round if amounts were ungrounded. */
  const handleCritique = async (initialRaw: string, ungrounded: number[], history: ChatMessage[]): Promise<Explanation | null> => {
    if (ungrounded.length === 0) return null;
    const problems = ungrounded.map(n =>
      `ungrounded amount: ${n} EUR${demo && n === DEMO_INVENTED_AMOUNT ? ' (injected by DEMO_CRITIC)' : ''}`);
    const trace = (revised: boolean) =>
      ctx.trace('critique', { agent: 'explainer', problems, revised, ...(demo ? { demo_injected: true } : {}) });
    const critiquePrompt = `These amounts are not in the evidence rows: ${ungrounded.join(', ')} EUR. Revise using only the evidence. Return strict JSON matching the Explanation schema.`;
    try {
      const revisedRaw = await ctx.llm.chat([
        ...history,
        { role: 'assistant', content: initialRaw },
        { role: 'user', content: critiquePrompt },
      ], { model: ctx.deepModel });

      const revised = parseAnswer(revisedRaw);
      if (revised.explanation && revised.ungrounded.length === 0) {
        trace(true);
        return { ...revised.explanation, uncertain: false, uncertainty_note: null };
      }
      trace(false);
      return revised.explanation
        ? { ...revised.explanation, uncertain: true, uncertainty_note: `Amounts not found in the evidence rows: ${revised.ungrounded.length ? revised.ungrounded.join(', ') : ungrounded.join(', ')} EUR.` }
        : null;
    } catch {
      trace(false);
      return null;
    }
  };

  // DEMO_CRITIC: only the run's main explanation, only the model's first answer
  const demo = ctx.demoCritic === true && !input.finding_id;
  const firstAnswer = (raw: string) => (demo ? injectDemoAmount(raw) : raw);

  // 1. Markovian engine: bounded multi-chunk investigation on the deep lane; its final JSON answer is grounded
  if (ctx.engines?.markovian) {
    try {
      const inv = await runExplainerInvestigation(ctx.engines.markovian, {
        question: input.question,
        findingId: input.finding_id,
        findings: input.findings,
        generator: prompt => ctx.llm.chat([{ role: 'user', content: prompt }], { model: ctx.deepModel }),
      });
      ctx.trace('markovian_done', { chunks: inv.chunkCount, tokens: inv.tokensProcessed });
      const output = firstAnswer(inv.output);
      const parsed = parseAnswer(output);
      if (parsed.explanation) {
        if (parsed.ungrounded.length > 0) {
          const revised = await handleCritique(output, parsed.ungrounded, [
            { role: 'system', content: loadPrompt('explainer') },
            { role: 'user', content: `Question: ${JSON.stringify(input.question)}\nFindings: ${JSON.stringify(relevantFindings, null, 2)}` },
          ]);
          if (revised) return revised;
        }
        return parsed.explanation;
      }
      ctx.trace('llm_rejected', { reason: 'Markovian answer had no cause citing a known finding' });
    } catch (e) {
      ctx.trace('llm_failed', { engine: 'markovian', error: (e as Error).message });
    }
  }

  // 2. Direct LLM chat synthesis
  try {
    const prompt = `You are the Explainer agent for Ledger Lens.
Question: ${JSON.stringify(input.question)}
Findings available:
${JSON.stringify(relevantFindings, null, 2)}

Respond with strict JSON matching the Explanation schema. Every cause must cite one finding_id from the list,
and amount_eur must be a number that appears in that finding (its impact or its evidence rows):
{
  "summary": "1-2 sentence executive summary citing exact causes and amounts",
  "causes": [
    { "rank": 1, "cause": "...", "amount_eur": 0.00, "finding_id": "..." }
  ],
  "uncertain": false,
  "uncertainty_note": null
}`;

    const history: ChatMessage[] = [
      { role: 'system', content: loadPrompt('explainer') },
      { role: 'user', content: prompt },
    ];
    const raw = firstAnswer(await ctx.llm.chat(history, { model: ctx.deepModel }));

    const parsed = parseAnswer(raw);
    if (parsed.explanation) {
      if (parsed.ungrounded.length > 0) {
        const revised = await handleCritique(raw, parsed.ungrounded, history);
        if (revised) return revised;
      }
      return parsed.explanation;
    }
    ctx.trace('llm_rejected', { reason: 'no summary or no cause citing a known finding' });
  } catch (e) {
    ctx.trace('llm_failed', { error: (e as Error).message });
  }

  // 3. Deterministic fallback based on input findings
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

  return {
    question: input.question,
    summary: 'No leak in the current data explains this.',
    causes: [],
    uncertain: true,
    uncertainty_note: 'No findings matched the question, so there is no evidence to cite.',
  };
}
