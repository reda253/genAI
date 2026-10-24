// CFO agent (P5): morning brief and top 3 moves ranked by impact and urgency; P4 adds H-MEM memories.
import type { ActionType, AgentContext, Brief, Explanation, Finding, Forecast, Move, Urgency } from './types.ts';
import { extractJson } from './explainer.ts';
import { applyMemoriesToMoves } from '../engines/hmemAdapter.ts';

const ACTIONS: ActionType[] = ['bill_hours', 'send_reminder', 'cancel_subscription', 'dispute_charge', 'raise_rate'];
const URGENCIES: Urgency[] = ['high', 'medium', 'low'];

/**
 * Exactly 3 model moves that each cite known findings with valid enums, or null.
 * Ids, ranks, status and money come from us; only the wording and choice come from the model.
 */
function groundMoves(raw: unknown, findings: Finding[]): Move[] | null {
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const byId = new Map(findings.map(f => [f.id, f]));
  const moves: Move[] = [];
  for (const [i, m] of raw.entries()) {
    const ids: string[] = Array.isArray(m?.finding_ids) ? m.finding_ids.map(String) : [];
    if (!ids.length || !ids.every(id => byId.has(id))) return null;
    if (!ACTIONS.includes(m.action_type) || !URGENCIES.includes(m.urgency)) return null;
    moves.push({
      id: `m00${i + 1}`,
      rank: i + 1,
      title: String(m.title ?? byId.get(ids[0])!.title),
      action_type: m.action_type,
      monthly_impact_eur: Math.round(ids.reduce((s, id) => s + byId.get(id)!.monthly_impact_eur, 0) * 100) / 100,
      urgency: m.urgency,
      reason: String(m.reason ?? ''),
      finding_ids: ids,
      memory_note: null,
      status: 'pending',
    });
  }
  return moves;
}

function mapFindingToAction(f: Finding): { action_type: ActionType; urgency: Urgency; reason: string } {
  switch (f.type) {
    case 'unbilled_hours':
      return {
        action_type: 'bill_hours',
        urgency: 'high',
        reason: `${f.title}. Invoice the client to prevent unbilled cash loss.`,
      };
    case 'late_payer':
      return {
        action_type: 'send_reminder',
        urgency: 'high',
        reason: `${f.title}. ${f.cash_at_risk_eur} EUR is overdue and at risk.`,
      };
    case 'unused_subscription':
      return {
        action_type: 'cancel_subscription',
        urgency: 'medium',
        reason: `${f.title}. Cancel plan to eliminate recurring waste.`,
      };
    case 'duplicate_charge':
      return {
        action_type: 'dispute_charge',
        urgency: 'high',
        reason: `${f.title}. Dispute erroneous charge with the vendor.`,
      };
    case 'price_rise':
      return {
        action_type: 'cancel_subscription',
        urgency: 'medium',
        reason: `${f.title}. Review necessity or negotiate previous tier.`,
      };
    case 'underpriced_service':
      return {
        action_type: 'raise_rate',
        urgency: 'low',
        reason: `${f.title}. Renegotiate terms toward prevailing market rate.`,
      };
  }
}

export async function cfo(
  ctx: AgentContext,
  input: { findings: Finding[]; forecast: Forecast; explanation: Explanation },
): Promise<Brief> {
  const nowIso = new Date().toISOString();
  const cashToday = input.forecast.start_balance; // latest balance from cash_position, via the Forecaster

  let brief: Brief | null = null;

  try {
    const prompt = `You are the CFO agent for Ledger Lens.
Current Cash: ${cashToday} EUR
Findings:
${JSON.stringify(input.findings, null, 2)}
Explanation:
${JSON.stringify(input.explanation, null, 2)}

Produce a Morning Brief in strict JSON format with exactly 3 prioritized moves.
Rules: action_type must be one of ${ACTIONS.join(', ')}. urgency must be one of ${URGENCIES.join(', ')}.
finding_ids must only contain ids from the findings above.
{
  "run_id": "${ctx.runId}",
  "generated_at": "${nowIso}",
  "cash_today": ${cashToday},
  "what_changed": ["Summary point 1", "Summary point 2"],
  "moves": [
    {
      "id": "m001",
      "rank": 1,
      "title": "Action title",
      "action_type": "bill_hours",
      "monthly_impact_eur": 1320.00,
      "urgency": "high",
      "reason": "Clear explanation",
      "finding_ids": ["f002"],
      "memory_note": null,
      "status": "pending"
    }
  ],
  "findings_count": ${input.findings.length}
}`;

    const raw = await ctx.llm.chat([
      { role: 'system', content: 'You are CFO agent. Output ONLY valid JSON with exactly 3 moves.' },
      { role: 'user', content: prompt },
    ], { model: ctx.deepModel });

    const parsed = extractJson(raw) as Partial<Brief>;
    const moves = groundMoves(parsed?.moves, input.findings);
    if (moves) {
      brief = {
        run_id: ctx.runId,
        generated_at: nowIso,
        cash_today: cashToday, // never the model's number
        what_changed: Array.isArray(parsed.what_changed) ? parsed.what_changed.map(String) : [],
        moves,
        findings_count: input.findings.length,
      };
    } else {
      ctx.trace('llm_rejected', { reason: 'moves were not 3 valid moves citing known findings' });
    }
  } catch (e) {
    ctx.trace('llm_failed', { error: (e as Error).message });
  }

  // Deterministic ranking from findings
  if (!brief) {
    const sortedFindings = [...input.findings].sort((a, b) => {
      const scoreA = a.monthly_impact_eur + a.cash_at_risk_eur;
      const scoreB = b.monthly_impact_eur + b.cash_at_risk_eur;
      return scoreB - scoreA;
    });

    const selectedFindings = sortedFindings.slice(0, 3);
    // Fewer than 3 findings = fewer moves: never pad with invented ones.
    const moves: Move[] = selectedFindings.map((f, index) => {
      const action = mapFindingToAction(f);
      return {
        id: `m00${index + 1}`,
        rank: index + 1,
        title: action.action_type === 'bill_hours'
          ? `Invoice ${f.title}`
          : action.action_type === 'send_reminder'
          ? `Send payment reminder for ${f.title}`
          : action.action_type === 'cancel_subscription'
          ? `Cancel ${f.title}`
          : f.title,
        action_type: action.action_type,
        monthly_impact_eur: f.monthly_impact_eur,
        urgency: action.urgency,
        reason: action.reason,
        finding_ids: [f.id],
        memory_note: null,
        status: 'pending',
      };
    });

    brief = {
      run_id: ctx.runId,
      generated_at: nowIso,
      cash_today: cashToday,
      what_changed: selectedFindings.slice(0, 2).map(f => f.title),
      moves,
      findings_count: input.findings.length,
    };
  }

  // P4 H-MEM: apply user decision memories to adjust move ranking and memory_note
  if (ctx.engines?.hmem) {
    brief.moves = applyMemoriesToMoves(ctx.engines.hmem, brief.moves);
  }

  return brief;
}
