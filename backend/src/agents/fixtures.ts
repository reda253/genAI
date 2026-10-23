// Mock world for Sara until real agents land. Values follow docs/contracts.md §3 examples.
import type { Brief, Evidence, Explanation, Finding, Forecast, Move } from './types.ts';

const ranAt = '2026-10-01T08:00:02Z';
const ev = (id: string, view: string, sql: string, rows: Record<string, unknown>[]): Evidence =>
  ({ id, view, sql, rows, ran_at: ranAt });

export const findings: Finding[] = [
  {
    id: 'f001', type: 'late_payer', title: 'Nordwind Studio pays 47 days late on average',
    client_id: 'c04', subscription_id: null, monthly_impact_eur: 0, cash_at_risk_eur: 4800.00, confidence: 'high',
    evidence: [ev('e001', 'ar_aging',
      "SELECT invoice_id, amount, days_late FROM ar_aging WHERE client_id = 'c04' AND days_late > 30",
      [{ invoice_id: 'inv0031', amount: 2400.00, days_late: 47 }, { invoice_id: 'inv0038', amount: 2400.00, days_late: 33 }])],
    detected_at: '2026-10-01T08:00:05Z',
  },
  {
    id: 'f002', type: 'unbilled_hours', title: '22 hours for Atlas Co were never invoiced',
    client_id: 'c01', subscription_id: null, monthly_impact_eur: 1320.00, cash_at_risk_eur: 0, confidence: 'high',
    evidence: [ev('e002', 'client_profitability',
      "SELECT month, hours_logged, hours_billed, unbilled_hours FROM client_profitability WHERE client_id = 'c01' AND unbilled_pct > 10",
      [{ month: '2026-08-01', hours_logged: 52, hours_billed: 40, unbilled_hours: 12 },
        { month: '2026-09-01', hours_logged: 50, hours_billed: 40, unbilled_hours: 10 }])],
    detected_at: '2026-10-01T08:00:05Z',
  },
  {
    id: 'f003', type: 'price_rise', title: 'Adobe Creative Cloud price rose 21% since April',
    client_id: null, subscription_id: 'sub02', monthly_impact_eur: 14.00, cash_at_risk_eur: 0, confidence: 'high',
    evidence: [ev('e003', 'subscription_usage',
      "SELECT vendor, first_charge_amount, last_charge_amount, price_change_pct FROM subscription_usage WHERE price_change_pct > 15",
      [{ vendor: 'Adobe', first_charge_amount: 66.99, last_charge_amount: 80.99, price_change_pct: 20.9 }])],
    detected_at: '2026-10-01T08:00:05Z',
  },
  {
    id: 'f004', type: 'unused_subscription', title: 'Webflow not opened for 94 days, still charged',
    client_id: null, subscription_id: 'sub05', monthly_impact_eur: 29.00, cash_at_risk_eur: 0, confidence: 'high',
    evidence: [ev('e004', 'subscription_usage',
      'SELECT vendor, monthly_cost, days_since_login FROM subscription_usage WHERE days_since_login > 60',
      [{ vendor: 'Webflow', monthly_cost: 29.00, days_since_login: 94 }])],
    detected_at: '2026-10-01T08:00:05Z',
  },
  {
    id: 'f005', type: 'underpriced_service', title: 'Illustration work for Kestrel is 30% under market rate',
    client_id: 'c07', subscription_id: null, monthly_impact_eur: 540.00, cash_at_risk_eur: 0, confidence: 'medium',
    evidence: [ev('e005', 'client_profitability',
      "SELECT client_name, hourly_rate, market_rate, hours_logged FROM client_profitability WHERE client_id = 'c07' AND month = '2026-09-01'",
      [{ client_name: 'Kestrel Books', hourly_rate: 42.00, market_rate: 60.00, hours_logged: 30 }])],
    detected_at: '2026-10-01T08:00:05Z',
  },
  {
    id: 'f006', type: 'duplicate_charge', title: 'Figma charged twice in August',
    client_id: null, subscription_id: 'sub03', monthly_impact_eur: 15.00, cash_at_risk_eur: 0, confidence: 'high',
    evidence: [ev('e006', 'subscription_usage',
      'SELECT vendor, monthly_cost, max_charges_in_a_month FROM subscription_usage WHERE max_charges_in_a_month > 1',
      [{ vendor: 'Figma', monthly_cost: 15.00, max_charges_in_a_month: 2 }])],
    detected_at: '2026-10-01T08:00:05Z',
  },
];

export const explanation: Explanation = {
  question: 'Why did my margin drop in September?',
  summary: 'Margin fell mainly because 22 hours for Atlas Co were never invoiced, and Kestrel work is priced under market.',
  causes: [
    { rank: 1, cause: '22 unbilled hours for Atlas Co', amount_eur: 1320.00, finding_id: 'f002', evidence: findings[1].evidence },
    { rank: 2, cause: 'Kestrel Books billed at 42 EUR/h vs 60 EUR/h market', amount_eur: 540.00, finding_id: 'f005', evidence: findings[4].evidence },
  ],
  uncertain: false,
  uncertainty_note: null,
};

const months = [
  ['2026-10-01', 6200.00, 4100.00], ['2026-11-01', 5800.00, 4150.00], ['2026-12-01', 4900.00, 4600.00],
  ['2027-01-01', 5200.00, 4300.00], ['2027-02-01', 5600.00, 4200.00], ['2027-03-01', 6000.00, 4250.00],
] as const;

export const baselineForecast: Forecast = (() => {
  let balance = 8420.00;
  const rows = months.map(([month, inflow, outflow]) => {
    balance = Math.round((balance + inflow - outflow) * 100) / 100;
    return { month, inflow, outflow, balance };
  });
  return { scenario: { type: 'baseline' }, start_balance: 8420.00, months: rows,
    min_balance: Math.min(...rows.map(r => r.balance)), runway_months: null };
})();

export const moves: Move[] = [
  { id: 'm001', rank: 1, title: 'Invoice Atlas Co for 22 unbilled hours', action_type: 'bill_hours', monthly_impact_eur: 1320.00,
    urgency: 'high', reason: 'Hours from August and September were logged but never invoiced.', finding_ids: ['f002'],
    memory_note: null, status: 'pending' },
  { id: 'm002', rank: 2, title: 'Send Nordwind Studio a payment reminder', action_type: 'send_reminder', monthly_impact_eur: 0,
    urgency: 'high', reason: '4,800 EUR is owed and invoice inv0031 is 47 days late.', finding_ids: ['f001'],
    memory_note: null, status: 'pending' },
  { id: 'm003', rank: 3, title: 'Cancel the unused Webflow plan', action_type: 'cancel_subscription', monthly_impact_eur: 29.00,
    urgency: 'medium', reason: 'Not opened for 94 days but still charged every month.', finding_ids: ['f004'],
    memory_note: null, status: 'pending' },
];

export function briefFor(runId: string, generatedAt: string): Brief {
  return {
    run_id: runId,
    generated_at: generatedAt,
    cash_today: 8420.00,
    what_changed: ['Adobe price rose 21% since April', 'Invoice inv0031 is now 47 days late'],
    moves: structuredClone(moves),
    findings_count: findings.length,
  };
}
