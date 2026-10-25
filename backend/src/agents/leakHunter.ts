// Leak Hunter agent (P5): fixed SQL checks over Zetaris views + LLM ranking and descriptions.
import type { AgentContext, Finding, Evidence } from './types.ts';
import { extractJson } from './explainer.ts';
import { loadPrompt } from './prompts.ts';

export const SQL_CHECKS = {
  unbilled_hours: `SELECT client_id, client_name, month, unbilled_hours, unbilled_pct, hourly_rate, effective_rate FROM client_profitability WHERE unbilled_pct > 10 OR unbilled_hours > 0`,
  price_rise: `SELECT subscription_id, vendor, plan, monthly_cost, first_charge_amount, last_charge_amount, price_change_pct FROM subscription_usage WHERE price_change_pct > 15`,
  unused_subscription: `SELECT subscription_id, vendor, plan, monthly_cost, last_login_date, days_since_login FROM subscription_usage WHERE days_since_login > 60`,
  late_payer: `SELECT invoice_id, client_id, client_name, amount, due_date, days_late, bucket, status FROM ar_aging WHERE days_late > 30`,
  underpriced_service: `SELECT client_id, client_name, hourly_rate, market_rate FROM client_profitability WHERE hourly_rate < market_rate * 0.9`,
  duplicate_charge: `SELECT subscription_id, vendor, monthly_cost, max_charges_in_a_month FROM subscription_usage WHERE max_charges_in_a_month > 1`,
} as const;

export async function leakHunter(ctx: AgentContext): Promise<Finding[]> {
  // Every number comes from Zetaris: no fixture fallback. A failed check is traced; all failed = run fails.
  const checks = Object.entries(SQL_CHECKS);
  const results = await Promise.allSettled(checks.map(([, sql]) => ctx.sql(sql)));
  results.forEach((r, i) => {
    if (r.status === 'rejected') ctx.trace('check_failed', { check: checks[i][0], error: String(r.reason?.message ?? r.reason) });
  });
  ctx.trace('checks_done', { ran: checks.length, failed: results.filter(r => r.status === 'rejected').length });
  if (results.every(r => r.status === 'rejected')) {
    const first = results[0] as PromiseRejectedResult;
    throw new Error(`Zetaris unavailable, no leak check could run: ${first.reason?.message ?? first.reason}`);
  }

  const detectedFindings: Finding[] = [];
  let findingCounter = 1;
  const nowIso = new Date().toISOString();

  const addFinding = (f: Omit<Finding, 'id' | 'detected_at'>) => {
    const id = `f${String(findingCounter++).padStart(3, '0')}`;
    detectedFindings.push({
      ...f,
      id,
      detected_at: nowIso,
    });
  };

  // 1. Unbilled hours - Aggregate by client_id (one finding per leak story)
  if (results[0].status === 'fulfilled' && results[0].value.rows.length > 0) {
    const q = results[0].value;
    const byClient = new Map<string, Record<string, unknown>[]>();
    for (const row of q.rows) {
      const cId = String(row.client_id || 'unknown');
      const list = byClient.get(cId) ?? [];
      list.push(row);
      byClient.set(cId, list);
    }

    for (const [clientId, rows] of byClient.entries()) {
      const clientName = String(rows[0].client_name || clientId);
      let totalHours = 0;
      let totalImpact = 0;
      for (const r of rows) {
        const h = Number(r.unbilled_hours || 0);
        // Value unbilled time at the client's contracted rate, not the
        // realized rate (revenue_invoiced / hours_logged), which is diluted
        // by the unbilled hours themselves.
        const rate = Number(r.hourly_rate || r.effective_rate || 0);
        totalHours += h;
        totalImpact += h * rate;
      }

      const evidence: Evidence = {
        id: `e${String(findingCounter).padStart(3, '0')}`,
        view: 'client_profitability',
        sql: q.sql,
        rows,
        ran_at: q.ranAt || nowIso,
      };

      addFinding({
        type: 'unbilled_hours',
        title: `${totalHours} hours for ${clientName} were never invoiced`,
        client_id: clientId,
        subscription_id: null,
        monthly_impact_eur: Math.round(totalImpact * 100) / 100,
        cash_at_risk_eur: 0,
        confidence: 'high',
        evidence: [evidence],
      });
    }
  }

  // 2. Price rise - Aggregate by subscription_id
  if (results[1].status === 'fulfilled' && results[1].value.rows.length > 0) {
    const q = results[1].value;
    const bySub = new Map<string, Record<string, unknown>[]>();
    for (const row of q.rows) {
      const subId = String(row.subscription_id || 'unknown');
      const list = bySub.get(subId) ?? [];
      list.push(row);
      bySub.set(subId, list);
    }

    for (const [subId, rows] of bySub.entries()) {
      const row = rows[0];
      const vendor = String(row.vendor || 'Subscription');
      const first = Number(row.first_charge_amount || 0);
      const last = Number(row.last_charge_amount || 0);
      const pct = Number(row.price_change_pct || 0);
      const diff = Math.max(0, Math.round((last - first) * 100) / 100);

      const evidence: Evidence = {
        id: `e${String(findingCounter).padStart(3, '0')}`,
        view: 'subscription_usage',
        sql: q.sql,
        rows,
        ran_at: q.ranAt || nowIso,
      };

      addFinding({
        type: 'price_rise',
        title: `${vendor} price rose ${pct}% (from ${first} to ${last} EUR)`,
        client_id: null,
        subscription_id: subId,
        monthly_impact_eur: diff,
        cash_at_risk_eur: 0,
        confidence: 'high',
        evidence: [evidence],
      });
    }
  }

  // 3. Unused subscription - Aggregate by subscription_id
  if (results[2].status === 'fulfilled' && results[2].value.rows.length > 0) {
    const q = results[2].value;
    const bySub = new Map<string, Record<string, unknown>[]>();
    for (const row of q.rows) {
      const subId = String(row.subscription_id || 'unknown');
      const list = bySub.get(subId) ?? [];
      list.push(row);
      bySub.set(subId, list);
    }

    for (const [subId, rows] of bySub.entries()) {
      const row = rows[0];
      const vendor = String(row.vendor || 'Subscription');
      const cost = Number(row.monthly_cost || 0);
      const days = Number(row.days_since_login || 0);

      const evidence: Evidence = {
        id: `e${String(findingCounter).padStart(3, '0')}`,
        view: 'subscription_usage',
        sql: q.sql,
        rows,
        ran_at: q.ranAt || nowIso,
      };

      addFinding({
        type: 'unused_subscription',
        title: `${vendor} not opened for ${days} days, still charged`,
        client_id: null,
        subscription_id: subId,
        monthly_impact_eur: cost,
        cash_at_risk_eur: 0,
        confidence: 'high',
        evidence: [evidence],
      });
    }
  }

  // 4. Late payer - Aggregate multiple overdue invoices by client_id into ONE finding
  if (results[3].status === 'fulfilled' && results[3].value.rows.length > 0) {
    const q = results[3].value;
    const byClient = new Map<string, Record<string, unknown>[]>();
    for (const row of q.rows) {
      const clientId = String(row.client_id || 'unknown');
      const list = byClient.get(clientId) ?? [];
      list.push(row);
      byClient.set(clientId, list);
    }

    for (const [clientId, rows] of byClient.entries()) {
      const clientName = String(rows[0].client_name || clientId);
      let totalOverdue = 0;
      let maxDaysLate = 0;
      for (const r of rows) {
        totalOverdue += Number(r.amount || 0);
        maxDaysLate = Math.max(maxDaysLate, Number(r.days_late || 0));
      }

      const evidence: Evidence = {
        id: `e${String(findingCounter).padStart(3, '0')}`,
        view: 'ar_aging',
        sql: q.sql,
        rows,
        ran_at: q.ranAt || nowIso,
      };

      addFinding({
        type: 'late_payer',
        title: `${clientName} pays ${maxDaysLate} days late on average`,
        client_id: clientId,
        subscription_id: null,
        monthly_impact_eur: 0,
        cash_at_risk_eur: Math.round(totalOverdue * 100) / 100,
        confidence: 'high',
        evidence: [evidence],
      });
    }
  }

  // 5. Underpriced service - Aggregate by client_id
  if (results[4].status === 'fulfilled' && results[4].value.rows.length > 0) {
    const q = results[4].value;
    const byClient = new Map<string, Record<string, unknown>[]>();
    for (const row of q.rows) {
      const clientId = String(row.client_id || 'unknown');
      const list = byClient.get(clientId) ?? [];
      list.push(row);
      byClient.set(clientId, list);
    }

    for (const [clientId, rows] of byClient.entries()) {
      const row = rows[0];
      const clientName = String(row.client_name || clientId);
      const hourlyRate = Number(row.hourly_rate || 0);
      const marketRate = Number(row.market_rate || 0);
      const diffRate = Math.max(0, marketRate - hourlyRate);
      const estimatedMonthlyHours = 30; // typical monthly billable hours
      const monthlyImpact = Math.round(diffRate * estimatedMonthlyHours * 100) / 100;

      const evidence: Evidence = {
        id: `e${String(findingCounter).padStart(3, '0')}`,
        view: 'client_profitability',
        sql: q.sql,
        rows,
        ran_at: q.ranAt || nowIso,
      };

      addFinding({
        type: 'underpriced_service',
        title: `${clientName} billed at ${hourlyRate} EUR/h vs ${marketRate} EUR/h market`,
        client_id: clientId,
        subscription_id: null,
        monthly_impact_eur: monthlyImpact,
        cash_at_risk_eur: 0,
        confidence: 'medium',
        evidence: [evidence],
      });
    }
  }

  // 6. Duplicate charge - Aggregate by subscription_id
  if (results[5].status === 'fulfilled' && results[5].value.rows.length > 0) {
    const q = results[5].value;
    const bySub = new Map<string, Record<string, unknown>[]>();
    for (const row of q.rows) {
      const subId = String(row.subscription_id || 'unknown');
      const list = bySub.get(subId) ?? [];
      list.push(row);
      bySub.set(subId, list);
    }

    for (const [subId, rows] of bySub.entries()) {
      const row = rows[0];
      const vendor = String(row.vendor || 'Vendor');
      const cost = Number(row.monthly_cost || 0);

      const evidence: Evidence = {
        id: `e${String(findingCounter).padStart(3, '0')}`,
        view: 'subscription_usage',
        sql: q.sql,
        rows,
        ran_at: q.ranAt || nowIso,
      };

      addFinding({
        type: 'duplicate_charge',
        title: `${vendor} charged twice in August`,
        client_id: null,
        subscription_id: subId,
        monthly_impact_eur: cost,
        cash_at_risk_eur: 0,
        confidence: 'high',
        evidence: [evidence],
      });
    }
  }

  return rankFindings(ctx, detectedFindings);
}

// Nemotron (fast lane) orders the findings by urgency. It only returns ids: every number stays from SQL.
async function rankFindings(ctx: AgentContext, findings: Finding[]): Promise<Finding[]> {
  if (findings.length < 2) return findings;
  const summary = findings.map(({ id, type, title, monthly_impact_eur, cash_at_risk_eur, confidence }) =>
    ({ id, type, title, monthly_impact_eur, cash_at_risk_eur, confidence }));
  try {
    const raw = await ctx.llm.chat([
      { role: 'system', content: loadPrompt('leak_hunter') },
      { role: 'user', content: `Findings:\n${JSON.stringify(summary, null, 2)}` },
    ]);
    const order = (extractJson(raw) as { order?: unknown })?.order;
    const byId = new Map(findings.map(f => [f.id, f]));
    const ranked = Array.isArray(order) ? [...new Set(order.map(String))].flatMap(id => byId.get(id) ?? []) : [];
    if (ranked.length === 0) {
      ctx.trace('llm_rejected', { agent: 'leak_hunter', reason: 'ranking cited no known finding id' });
      return findings;
    }
    return [...ranked, ...findings.filter(f => !ranked.includes(f))];
  } catch (e) {
    ctx.trace('llm_failed', { agent: 'leak_hunter', error: (e as Error).message });
    return findings;
  }
}
