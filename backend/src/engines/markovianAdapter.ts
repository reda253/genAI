// Markovian adapter for Ledger Lens — runs multi-step hypothesis investigations
// in bounded chunks with carryover of evidence.
import type { Markovian } from './markovian/index.ts';
import type { Cause, Explanation, Finding } from '../agents/types.ts';

export interface InvestigationResult {
  /** The model's investigation text; the Explainer parses and grounds the final JSON from it. */
  output: string;
  /** Deterministic summary of the target findings (no model involved). */
  explanation: Explanation;
  chunkCount: number;
  tokensProcessed: number;
}

export async function runExplainerInvestigation(
  markovian: Markovian,
  input: {
    question: string;
    findingId: string | null;
    findings: Finding[];
    generator?: (prompt: string) => Promise<string>;
  },
): Promise<InvestigationResult> {
  const targetFindings = input.findingId
    ? input.findings.filter(f => f.id === input.findingId)
    : input.findings;

  // Build sequential hypothesis chunks — one chunk per finding/hypothesis
  const hypothesisSections = targetFindings.map((f, i) => {
    const evidenceText = f.evidence.map(e =>
      `Evidence [${e.id}] from view ${e.view}:\nSQL: ${e.sql}\nRows: ${JSON.stringify(e.rows)}`
    ).join('\n');

    return [
      `--- HYPOTHESIS CHUNK ${i + 1} ---`,
      `Finding ID: ${f.id}`,
      `Title: ${f.title}`,
      `Type: ${f.type}`,
      `Monthly Impact EUR: ${f.monthly_impact_eur}`,
      `Cash at Risk EUR: ${f.cash_at_risk_eur}`,
      `Evidence:\n${evidenceText}`,
      `--- END HYPOTHESIS CHUNK ---`,
    ].join('\n');
  });

  const sourceDocument = hypothesisSections.join('\n\n');
  const prompt = `Investigate the following question: ${JSON.stringify(input.question)}. Evaluate each hypothesis chunk against the evidence. Carry over established causes and discard unsubstantiated claims.
When the investigation is complete, end with ONLY this JSON (each cause cites one Finding ID, amount_eur is a number from that finding):
{"summary": "1-2 sentences", "causes": [{"rank": 1, "cause": "...", "amount_eur": 0.00, "finding_id": "..."}], "uncertain": false, "uncertainty_note": null}`;

  // Run through Markovian's chunked loop
  const customGenerator = input.generator
    ? async (p: string) => ({ text: await input.generator!(p) })
    : undefined;

  const run = await markovian.run({
    prompt,
    mode: 'RESEARCH',
    attachments: [{ name: 'hypotheses.txt', content: sourceDocument }],
    generator: customGenerator,
    reflect: false,
  });

  // Build ranked causes from investigated findings that have money impact
  const relevantFindings = targetFindings
    .filter(f => f.monthly_impact_eur > 0 || f.cash_at_risk_eur > 0)
    .sort((a, b) => (b.monthly_impact_eur || b.cash_at_risk_eur) - (a.monthly_impact_eur || a.cash_at_risk_eur));

  const causes: Cause[] = relevantFindings.map((f, idx) => ({
    rank: idx + 1,
    cause: f.title,
    amount_eur: f.monthly_impact_eur || f.cash_at_risk_eur,
    finding_id: f.id,
    evidence: f.evidence,
  }));

  const summary = causes.length > 0
    ? `Margin fell mainly because ${causes.map(c => `${c.cause} (${c.amount_eur.toFixed(2)} EUR)`).join(', ')}.`
    : 'No significant leaks identified for the specified question.';

  const explanation: Explanation = {
    question: input.question,
    summary,
    causes,
    uncertain: causes.length === 0,
    uncertainty_note: causes.length === 0 ? 'Insufficient evidence found in the data window.' : null,
  };

  return {
    output: run.output,
    explanation,
    chunkCount: run.chunks.length,
    tokensProcessed: run.totalTokensUsed,
  };
}
