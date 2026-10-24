import { createZetarisClient } from '../src/zetaris/client.ts';
import { leakHunter } from '../src/agents/leakHunter.ts';
import type { Llm } from '../src/agents/types.ts';

const nope = () => Promise.reject(new Error('llm must not be needed to find leaks'));
const llm: Llm = { chat: nope, generate: nope, listModels: nope };

// Cross-layer check: the Zetaris mock views + Leak Hunter must reproduce the
// six data-v1 leaks and the expected monthly impacts, with no false alarms.
test('mock Zetaris views produce exactly the six answer-key findings', async () => {
  const zetaris = createZetarisClient({
    restUrl: 'http://unused',
    apiKey: '',
    orgId: '1',
    mock: true,
  });

  const findings = await leakHunter({
    runId: 'run_test_zetaris',
    llm,
    sql: zetaris.querySql,
    trace: () => {},
  });

  const summary = findings
    .map((finding) => ({
      type: finding.type,
      client_id: finding.client_id,
      subscription_id: finding.subscription_id,
      monthly_impact_eur: finding.monthly_impact_eur,
      cash_at_risk_eur: finding.cash_at_risk_eur,
    }))
    .sort((a, b) => a.type.localeCompare(b.type));

  expect(summary).toEqual([
    {
      type: 'duplicate_charge',
      client_id: null,
      subscription_id: 'sub03',
      monthly_impact_eur: 15,
      cash_at_risk_eur: 0,
    },
    {
      type: 'late_payer',
      client_id: 'c04',
      subscription_id: null,
      monthly_impact_eur: 0,
      cash_at_risk_eur: 4800,
    },
    {
      type: 'price_rise',
      client_id: null,
      subscription_id: 'sub02',
      monthly_impact_eur: 14,
      cash_at_risk_eur: 0,
    },
    {
      type: 'unbilled_hours',
      client_id: 'c01',
      subscription_id: null,
      monthly_impact_eur: 1320,
      cash_at_risk_eur: 0,
    },
    {
      type: 'underpriced_service',
      client_id: 'c07',
      subscription_id: null,
      monthly_impact_eur: 540,
      cash_at_risk_eur: 0,
    },
    {
      type: 'unused_subscription',
      client_id: null,
      subscription_id: 'sub05',
      monthly_impact_eur: 29,
      cash_at_risk_eur: 0,
    },
  ]);
});
