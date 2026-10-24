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
            { client_id: 'c01', client_name: 'Atlas Co', unbilled_hours: 22, unbilled_pct: 25, effective_rate: 60 },
          ],
        });
      }
      if (sql === SQL_CHECKS.unused_subscription) {
        return Promise.resolve({
          sql,
          ranAt,
          rows: [
            { subscription_id: 'sub05', vendor: 'Webflow', plan: 'Pro', monthly_cost: 29.00, days_since_login: 94 },
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
    expect(unbilled?.client_id).toBe('c01');
    expect(unbilled?.monthly_impact_eur).toBe(1320);
    expect(unbilled?.evidence[0].view).toBe('client_profitability');

    const unused = findings.find(f => f.type === 'unused_subscription');
    expect(unused).toBeDefined();
    expect(unused?.subscription_id).toBe('sub05');
    expect(unused?.monthly_impact_eur).toBe(29.00);
    expect(unused?.evidence[0].view).toBe('subscription_usage');
  });

  it('aggregates multiple overdue invoices for the same client into one late_payer finding', async () => {
    const mockSql = (sql: string): Promise<QueryResult> => {
      const ranAt = '2026-10-01T08:00:00Z';
      if (sql === SQL_CHECKS.late_payer) {
        return Promise.resolve({
          sql,
          ranAt,
          rows: [
            { invoice_id: 'inv0031', client_id: 'c04', client_name: 'Nordwind Studio', amount: 2400.00, days_late: 47 },
            { invoice_id: 'inv0038', client_id: 'c04', client_name: 'Nordwind Studio', amount: 2400.00, days_late: 33 },
          ],
        });
      }
      return Promise.resolve({ sql, ranAt, rows: [] });
    };

    const ctx: AgentContext = {
      runId: 'run_test_003',
      llm: fakeLlm,
      sql: mockSql,
      trace: () => {},
    };

    const findings = await leakHunter(ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].type).toBe('late_payer');
    expect(findings[0].client_id).toBe('c04');
    expect(findings[0].cash_at_risk_eur).toBe(4800.00);
    expect(findings[0].evidence[0].rows).toHaveLength(2);
  });
});
