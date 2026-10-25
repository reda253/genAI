import { describe, expect, it } from 'vitest';
import { leakHunter } from '../src/agents/leakHunter.ts';
import { createEngines } from '../src/engines/index.ts';
import { getEntityContext, ingestZetarisData } from '../src/engines/worldModelAdapter.ts';
import { countEntities, ENTITY_SQL, fetchEntityRows } from '../src/zetaris/entitySql.ts';
import { fakeLlm, mockSql } from './helpers.ts';

describe('I3 entity SQL and World Model ingest', () => {
  it('fetches every contract row the adapter reads', async () => {
    const rows = await fetchEntityRows(mockSql);

    expect(rows.clientProfitability).toHaveLength(54);
    expect(rows.subscriptionUsage).toHaveLength(10);
    expect(rows.arAging).toHaveLength(54);

    expect(rows.clientProfitability[0]).toMatchObject({
      client_id: 'c01',
      client_name: 'Atlas Co',
      month: '2026-04-01',
    });
    expect(rows.clientProfitability[0]).toHaveProperty('revenue_received');
    expect(rows.subscriptionUsage[0]).toHaveProperty('days_since_login');
    expect(rows.arAging[0]).toHaveProperty('bucket');
    expect(ENTITY_SQL.clientProfitability).toContain('FROM client_profitability');
    expect(ENTITY_SQL.subscriptionUsage).toContain('FROM subscription_usage');
    expect(ENTITY_SQL.arAging).toContain('FROM ar_aging');
  });

  it('gives Client 360 a client with facts, findings and invoices', async () => {
    const rows = await fetchEntityRows(mockSql);
    const findings = await leakHunter({
      runId: 'run_test_entities',
      llm: fakeLlm,
      sql: mockSql,
      trace: () => {},
    });
    expect(findings).toHaveLength(6);
    expect(countEntities(rows, findings)).toBe(79);

    const { worldModel } = createEngines();
    await ingestZetarisData(worldModel, { ...rows, findings }, 'run_test_entities');

    const atlas = getEntityContext(worldModel, 'c01');
    expect(atlas.entity).toBeDefined();
    expect(atlas.entity?.attrs.client_name).toBe('Atlas Co');
    expect(atlas.entity?.attrs.hourly_rate).toBe(60);
    expect(
      atlas.facts.some(
        (fact) => fact.predicate === 'unbilled_hours' && Number(fact.value) === 10,
      ),
    ).toBe(true);
    expect(atlas.relatedFindings.some((entity) => entity.attrs.type === 'unbilled_hours')).toBe(true);
    expect(atlas.relatedInvoices).toHaveLength(6);

    const adobe = getEntityContext(worldModel, 'sub02');
    expect(adobe.entity?.name).toBe('Adobe');
    expect(adobe.entity?.attrs.monthly_cost).toBe(80.99);

    const invoice = getEntityContext(worldModel, 'inv0031');
    expect(invoice.entity?.attrs.amount).toBe(2400);
    expect(invoice.neighbors.some((entity) => entity.id.includes('c04'))).toBe(true);
  });
});
