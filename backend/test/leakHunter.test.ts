import { describe, expect, it } from 'vitest';
import { leakHunter, SQL_CHECKS } from '../src/agents/leakHunter.ts';
import type { AgentContext, QueryResult } from '../src/agents/types.ts';
import { fakeLlm } from './orchestrator.test.ts';

describe('leakHunter agent', () => {
  it('falls back to default fixtures when sql rejects (test mock mode)', async () => {
    const ctx: AgentContext = {
      runId: 'run_test_001',
      llm: fakeLlm,
      sql: () => Promise.reject(new Error('no live db')),
      trace: () => {},
    };

    const findings = await leakHunter(ctx);
    expect(findings.length).toBe(6);
    expect(findings.map(f => f.type)).toEqual([
      'late_payer',
      'unbilled_hours',
      'price_rise',
      'unused_subscription',
      'underpriced_service',
      'duplicate_charge',
    ]);
  });

  it('detects findings from SQL view query results', async () => {
    const mockSql = (sql: string): Promise<QueryResult> => {
      const ranAt = '2026-10-01T08:00:00Z';
      if (sql === SQL_CHECKS.unbilled_hours) {
        return Promise.resolve({
          sql,
          ranAt,
          rows: [
            { client_id: 'c02', client_name: 'Atlas Co', unbilled_hours: 22, unbilled_pct: 25, effective_rate: 60 },
          ],
        });
      }
      if (sql === SQL_CHECKS.unused_subscription) {
        return Promise.resolve({
          sql,
          ranAt,
          rows: [
            { subscription_id: 'sub04', vendor: 'Webflow', plan: 'Pro', monthly_cost: 29.00, days_since_login: 94 },
          ],
        });
      }
      return Promise.resolve({ sql, ranAt, rows: [] });
    };

    const ctx: AgentContext = {
      runId: 'run_test_002',
      llm: fakeLlm,
      sql: mockSql,
      trace: () => {},
    };

    const findings = await leakHunter(ctx);
    expect(findings.length).toBe(2);

    const unbilled = findings.find(f => f.type === 'unbilled_hours');
    expect(unbilled).toBeDefined();
    expect(unbilled?.client_id).toBe('c02');
    expect(unbilled?.monthly_impact_eur).toBe(1320);
    expect(unbilled?.evidence[0].view).toBe('client_profitability');

    const unused = findings.find(f => f.type === 'unused_subscription');
    expect(unused).toBeDefined();
    expect(unused?.subscription_id).toBe('sub04');
    expect(unused?.monthly_impact_eur).toBe(29.00);
    expect(unused?.evidence[0].view).toBe('subscription_usage');
  });
});
