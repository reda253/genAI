// Drafter agent (P5): generates grounded action drafts (emails, checklists, invoice lines) for moves.
// Shown to the user in a modal, NEVER sent automatically.
import type { ActionDraft, AgentContext, ChatMessage, Finding, Move } from './types.ts';
import { extractJson } from './explainer.ts';
import { loadPrompt } from './prompts.ts';

export interface DrafterInput {
  move: Move;
  findings: Finding[];
  ctx: AgentContext;
}

/** Collects every numeric value appearing in the move, its findings, and evidence rows. */
export function extractAllowedNumbers(move: Move, findings: Finding[]): Set<number> {
  const allowed = new Set<number>();
  if (Number.isFinite(move.monthly_impact_eur)) allowed.add(Math.round(move.monthly_impact_eur * 100) / 100);

  const byId = new Map(findings.map(f => [f.id, f]));
  for (const id of move.finding_ids) {
    const f = byId.get(id);
    if (!f) continue;
    if (Number.isFinite(f.monthly_impact_eur)) allowed.add(Math.round(f.monthly_impact_eur * 100) / 100);
    if (Number.isFinite(f.cash_at_risk_eur)) allowed.add(Math.round(f.cash_at_risk_eur * 100) / 100);
    for (const ev of f.evidence) {
      for (const row of ev.rows) {
        for (const val of Object.values(row)) {
          if (typeof val === 'number' && Number.isFinite(val)) {
            allowed.add(Math.round(val * 100) / 100);
          } else if (typeof val === 'string') {
            // dates and other text in the evidence ("2026-09-15") may be quoted as-is
            for (const n of extractNumbersFromText(val)) allowed.add(n);
          }
        }
      }
    }
  }
  return allowed;
}

/**
 * Extracts monetary and numerical values (> 0) from draft text to verify grounding.
 * List markers ("1." or "2)" at line start) are not values; "1,250.50" is one number, not two.
 */
export function extractNumbersFromText(text: string): number[] {
  const unlisted = text.replace(/^\s*\d+[.)]\s/gm, '');
  const matches = unlisted.match(/\b\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?\b|\b\d+(?:\.\d{1,2})?\b/g);
  if (!matches) return [];
  return matches
    .map(m => Math.round(Number(m.replace(/,/g, '')) * 100) / 100)
    .filter(n => Number.isFinite(n) && n > 0);
}

/** Deterministic template fallback when LLM is offline or invents ungrounded numbers. */
export function defaultDraftFor(move: Move, findings: Finding[]): ActionDraft {
  const byId = new Map(findings.map(f => [f.id, f]));
  const primaryFinding = move.finding_ids.map(id => byId.get(id)).find(Boolean);
  const amount = move.monthly_impact_eur > 0 ? move.monthly_impact_eur : (primaryFinding?.cash_at_risk_eur ?? 0);

  switch (move.action_type) {
    case 'send_reminder':
      return {
        move_id: move.id,
        kind: 'email',
        subject: `Payment Reminder: Overdue Balance (${amount} EUR)`,
        body: `Hello,\n\nThis is a friendly reminder that an overdue payment of ${amount} EUR is currently pending. Please review your records and arrange payment at your earliest convenience.\n\nBest regards,\nSara`,
        ungrounded: [],
      };
    case 'bill_hours':
      return {
        move_id: move.id,
        kind: 'invoice_lines',
        subject: `Invoice: ${move.title}`,
        body: `Line Item: Unbilled professional services\nReason: ${move.reason}\nTotal Amount Due: ${amount} EUR`,
        ungrounded: [],
      };
    case 'cancel_subscription':
      return {
        move_id: move.id,
        kind: 'steps',
        subject: null,
        body: `1. Log in to your vendor dashboard.\n2. Go to Account Settings > Subscriptions & Billing.\n3. Click Cancel Subscription and follow confirmation prompts.\n4. Verify recurring savings of ${amount} EUR/month.`,
        ungrounded: [],
      };
    case 'dispute_charge':
      return {
        move_id: move.id,
        kind: 'email',
        subject: `Dispute of Duplicate Charge (${amount} EUR)`,
        body: `Hello Support Team,\n\nWe noticed a duplicate charge of ${amount} EUR on our account statement. As this was charged in error, please initiate a refund for the duplicate transaction.\n\nThank you,\nSara`,
        ungrounded: [],
      };
    case 'raise_rate':
      return {
        move_id: move.id,
        kind: 'email',
        subject: `Rate Adjustment Discussion: ${primaryFinding?.title ?? 'Professional Services'}`,
        body: `Hello,\n\nThank you for our continued collaboration. In order to align with market benchmarks and rising operational costs, we are updating our service rates. Let us schedule a brief call to discuss this adjustment.\n\nBest regards,\nSara`,
        ungrounded: [],
      };
  }
}

export async function drafter(input: DrafterInput): Promise<ActionDraft> {
  const { move, findings, ctx } = input;
  const allowedNumbers = extractAllowedNumbers(move, findings);
  const byId = new Map(findings.map(f => [f.id, f]));
  const relevantFindings = move.finding_ids.map(id => byId.get(id)).filter(Boolean);

  const checkUngrounded = (draft: { subject?: string | null; body: string }): number[] => {
    const text = `${draft.subject ?? ''} ${draft.body}`;
    const numbers = extractNumbersFromText(text);
    return numbers.filter(n => !allowedNumbers.has(Math.round(n * 100) / 100));
  };

  try {
    const prompt = `You are Action Drafter for Ledger Lens.
Move:
${JSON.stringify(move, null, 2)}

Supporting Findings & Evidence:
${JSON.stringify(relevantFindings, null, 2)}

Produce a draft for this action.
Rules:
- kind must be one of: "email", "steps", "invoice_lines"
- If kind is "email" or "invoice_lines", provide a concise subject. If kind is "steps", subject must be null.
- Zero Hallucination: Do NOT invent amounts, dates, or hours. Every number must match the evidence.
- Respond with strict JSON matching:
{
  "kind": "email" | "steps" | "invoice_lines",
  "subject": "string or null",
  "body": "formatted content"
}`;

    const history: ChatMessage[] = [
      { role: 'system', content: loadPrompt('action_draft') },
      { role: 'user', content: prompt },
    ];

    const raw = await ctx.llm.chat(history, { model: ctx.deepModel });
    let parsed: any;
    try { parsed = extractJson(raw); } catch { parsed = null; }

    if (parsed && typeof parsed.body === 'string' && ['email', 'steps', 'invoice_lines'].includes(parsed.kind)) {
      let ungrounded = checkUngrounded(parsed);

      if (ungrounded.length > 0) {
        // G1: Critic revision loop
        const problems = ungrounded.map(n => `ungrounded number: ${n}`);
        try {
          const critiquePrompt = `These numbers were not found in the evidence: ${ungrounded.join(', ')}. Revise the draft using ONLY the provided evidence numbers. Return strict JSON.`;
          const revisedRaw = await ctx.llm.chat([
            ...history,
            { role: 'assistant', content: raw },
            { role: 'user', content: critiquePrompt },
          ], { model: ctx.deepModel });

          let revisedParsed: any;
          try { revisedParsed = extractJson(revisedRaw); } catch { revisedParsed = null; }
          if (revisedParsed && typeof revisedParsed.body === 'string' && ['email', 'steps', 'invoice_lines'].includes(revisedParsed.kind)) {
            const revisedUngrounded = checkUngrounded(revisedParsed);
            if (revisedUngrounded.length === 0) {
              ctx.trace('critique', { agent: 'cfo', problems, revised: true });
              return {
                move_id: move.id,
                kind: revisedParsed.kind,
                subject: revisedParsed.subject ?? null,
                body: revisedParsed.body,
                ungrounded: [],
              };
            }
          }
          ctx.trace('critique', { agent: 'cfo', problems, revised: false });
        } catch {
          ctx.trace('critique', { agent: 'cfo', problems, revised: false });
        }

        // Invented number not fixed by revision: fall back to template
        return defaultDraftFor(move, findings);
      }

      return {
        move_id: move.id,
        kind: parsed.kind,
        subject: parsed.subject ?? null,
        body: parsed.body,
        ungrounded: [],
      };
    }
  } catch (e) {
    ctx.trace('llm_failed', { agent: 'drafter', error: (e as Error).message });
  }

  // Fallback to deterministic template
  return defaultDraftFor(move, findings);
}
