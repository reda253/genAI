import { describe, expect, it } from 'vitest';
import { leakHunter, SQL_CHECKS } from '../src/agents/leakHunter.ts';
import type { AgentContext, QueryResult } from '../src/agents/types.ts';
import { fakeLlm, mockSql, scriptedLlm } from './helpers.ts';

describe('leakHunter agent', () => {
  it('fails the run when every Zetaris check fails, never returns fixture findings', async () => {
    const ctx: AgentContext = {
      runId: 'run_test_001',
      llm: fakeLlm,
      sql: () => Promise.reject(new Error('no live db')),
      trace: () => {},
    };
    await expect(leakHunter(ctx)).rejects.toThrow(/Zetaris.*no live db/);
  });

  it('returns no findings when the views show no leaks', async () => {
    const ctx: AgentContext = {
      runId: 'run_test_001b',
      llm: fakeLlm,
      sql: (sql: string) => Promise.resolve({ sql, ranAt: '2026-10-01T08:00:00Z', rows: [] }),
      trace: () => {},
    };
    expect(await leakHunter(ctx)).toEqual([]);
  });

  it('traces a failed check and keeps the others', async () => {
    const events: string[] = [];
    const ctx: AgentContext = {
      runId: 'run_test_001c',
      llm: fakeLlm,
      sql: (sql: string) => sql === SQL_CHECKS.price_rise
        ? Promise.reject(new Error('view missing'))
        : mockSql(sql),
      trace: (event: string) => { events.push(event); },
    };
    const findings = await leakHunter(ctx);
    expect(findings.map(f => f.type)).not.toContain('price_rise');
    expect(findings).toHaveLength(5);
    expect(events).toContain('check_failed');
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

  describe('Nemotron ranking', () => {
    const run = (llm: AgentContext['llm']) => {
      const events: string[] = [];
      const ctx: AgentContext = { runId: 'run_rank', llm, sql: mockSql, trace: e => { events.push(e); } };
      // Timestamps differ per run, so compare what the user sees: ids, types and money.
      return leakHunter(ctx).then(fs => ({
        findings: fs.map(({ id, type, title, monthly_impact_eur, cash_at_risk_eur }) => ({ id, type, title, monthly_impact_eur, cash_at_risk_eur })),
        events,
      }));
    };

    it('reorders findings by the model ranking, numbers and ids untouched', async () => {
      const { findings: base } = await run(fakeLlm);
      const { llm } = scriptedLlm('{"order": ["f004", "f002"]}');
      const { findings } = await run(llm);
      expect(findings.map(f => f.id).slice(0, 2)).toEqual(['f004', 'f002']);
      expect([...findings].sort((a, b) => a.id.localeCompare(b.id))).toEqual(base);
    });

    it('ignores unknown ids and keeps the SQL order when nothing is usable', async () => {
      const { findings: base } = await run(fakeLlm);
      const { findings, events } = await run(scriptedLlm('{"order": ["f999", "nope"]}').llm);
      expect(findings).toEqual(base);
      expect(events).toContain('llm_rejected');
    });

    it('keeps the SQL order and traces when the model is offline', async () => {
      const { findings, events } = await run(fakeLlm);
      expect(findings.map(f => f.id)).toEqual(findings.map(f => f.id).sort());
      expect(events).toContain('llm_failed');
    });
  });
});
