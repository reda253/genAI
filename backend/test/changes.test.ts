import { describeChanges, diffRuns } from '../src/agents/changes.ts';
import type { Finding } from '../src/agents/types.ts';

const f = (id: string, type: Finding['type'], client_id: string | null, subscription_id: string | null, monthly: number, risk = 0): Finding => ({
  id, type, title: `${type} ${client_id ?? subscription_id}`, client_id, subscription_id,
  monthly_impact_eur: monthly, cash_at_risk_eur: risk, confidence: 'high', evidence: [], detected_at: '',
});

test('diffRuns matches on (type, client_id, subscription_id), not on id', () => {
  const prev = [f('f001', 'unbilled_hours', 'c01', null, 1320), f('f002', 'price_rise', null, 's01', 20), f('f003', 'late_payer', 'c03', null, 0, 4800)];
  const cur = [f('f001', 'price_rise', null, 's01', 20), f('f002', 'late_payer', 'c03', null, 0, 6000), f('f003', 'unused_subscription', null, 's02', 15)];
  const d = diffRuns(prev, cur);
  expect(d.new.map(x => x.type)).toEqual(['unused_subscription']);
  expect(d.resolved.map(x => x.type)).toEqual(['unbilled_hours']);
  expect(d.changed).toEqual([{ finding_id: 'f002', field: 'cash_at_risk_eur', before: 4800, after: 6000 }]);
});

test('describeChanges gives one plain line per change, or none', () => {
  const prev = [f('f001', 'unbilled_hours', 'c01', null, 1320)];
  const cur = [f('f001', 'unbilled_hours', 'c01', null, 1500), f('f002', 'price_rise', null, 's01', 20)];
  expect(describeChanges(diffRuns(prev, cur), cur)).toEqual([
    'New: price_rise s01',
    'unbilled_hours c01: monthly impact EUR 1320.00 → 1500.00',
  ]);
  expect(describeChanges(diffRuns(cur, cur), cur)).toEqual([]);
});
