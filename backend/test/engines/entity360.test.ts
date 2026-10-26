import { describe, expect, it } from 'vitest';
import { WorldModel } from '../../src/engines/world-model/index.ts';
import { ingestZetarisData, getEntity360 } from '../../src/engines/worldModelAdapter.ts';
import type { Finding } from '../../src/agents/types.ts';

describe('World Model Entity 360 (Task I3)', () => {
  const sampleFindings: Finding[] = [
    {
      id: 'f001',
      type: 'unbilled_hours',
      title: '24.5 unbilled hours for Nordwind Legal',
      client_id: 'c01',
      subscription_id: null,
      monthly_impact_eur: 1470,
      cash_at_risk_eur: 1470,
      confidence: 'high',
      evidence: [],
      detected_at: '2026-10-25T10:00:00.000Z',
    },
    {
      id: 'f002',
      type: 'unused_subscription',
      title: 'GitHub seats unused for 72 days',
      client_id: null,
      subscription_id: 'sub02',
      monthly_impact_eur: 240,
      cash_at_risk_eur: 240,
      confidence: 'high',
      evidence: [],
      detected_at: '2026-10-25T10:00:00.000Z',
    },
  ];

  async function createPopulatedWorldModel(): Promise<WorldModel> {
    const wm = new WorldModel({ storage: 'memory', namespace: 'test-360' });
    await ingestZetarisData(wm, {
      clientProfitability: [
        {
          client_id: 'c01',
          client_name: 'Nordwind Legal',
          month: '2026-09-01',
          hours_logged: 50,
          hours_billed: 25.5,
          unbilled_hours: 24.5,
          hourly_rate: 60,
          market_rate: 85,
          effective_rate: 45,
          service: 'Legal Advisory',
        },
      ],
      subscriptionUsage: [
        {
          subscription_id: 'sub02',
          vendor: 'GitHub',
          plan: 'Enterprise',
          monthly_cost: 240,
          days_since_login: 72,
          price_change_pct: 15,
          max_charges_in_a_month: 1,
        },
      ],
      arAging: [
        {
          invoice_id: 'inv001',
          client_id: 'c01',
          client_name: 'Nordwind Legal',
          amount: 2500,
          issue_date: '2026-08-01',
          due_date: '2026-08-31',
          days_late: 25,
          bucket: '1-30',
          status: 'unpaid',
        },
        {
          invoice_id: 'inv002',
          client_id: 'c01',
          client_name: 'Nordwind Legal',
          amount: 1800,
          issue_date: '2026-07-01',
          due_date: '2026-07-31',
          days_late: 55,
          bucket: '31-60',
          status: 'unpaid',
        },
      ],
      findings: sampleFindings,
    });
    return wm;
  }

  it('retrieves Client 360 profile with facts, invoices, and matching findings', async () => {
    const wm = await createPopulatedWorldModel();
    const c01 = getEntity360(wm, 'c01', sampleFindings);

    expect(c01).not.toBeNull();
    expect(c01?.id).toBe('c01');
    expect(c01?.kind).toBe('client');
    expect(c01?.name).toBe('Nordwind Legal');
    expect(c01?.summary).toContain('Nordwind Legal');
    expect(c01?.summary).toContain('€60/h');
    expect(c01?.facts.hourly_rate).toBe(60);
    expect(c01?.facts.market_rate).toBe(85);
    expect(c01?.facts.unbilled_hours).toBe(24.5);

    // Invoices
    expect(c01?.invoices).toHaveLength(2);
    expect(c01?.invoices.map(i => i.invoice_id)).toContain('inv001');
    expect(c01?.invoices.map(i => i.invoice_id)).toContain('inv002');

    // Findings
    expect(c01?.findings).toHaveLength(1);
    expect(c01?.findings[0].id).toBe('f001');
  });

  it('retrieves Subscription 360 profile with facts and matching findings', async () => {
    const wm = await createPopulatedWorldModel();
    const sub02 = getEntity360(wm, 'sub02', sampleFindings);

    expect(sub02).not.toBeNull();
    expect(sub02?.id).toBe('sub02');
    expect(sub02?.kind).toBe('subscription');
    expect(sub02?.name).toBe('GitHub');
    expect(sub02?.summary).toContain('GitHub');
    expect(sub02?.facts.monthly_cost).toBe(240);
    expect(sub02?.facts.plan).toBe('Enterprise');
    expect(sub02?.facts.days_since_login).toBe(72);
    expect(sub02?.invoices).toHaveLength(0);

    // Findings
    expect(sub02?.findings).toHaveLength(1);
    expect(sub02?.findings[0].id).toBe('f002');
  });

  it('supports full prefixed entity IDs like client:zetaris:c01', async () => {
    const wm = await createPopulatedWorldModel();
    const entity = getEntity360(wm, 'client:zetaris:c01', sampleFindings);

    expect(entity).not.toBeNull();
    expect(entity?.id).toBe('c01');
    expect(entity?.kind).toBe('client');
  });

  it('returns null for unknown entity ID', async () => {
    const wm = await createPopulatedWorldModel();
    const unknown = getEntity360(wm, 'c999', sampleFindings);
    expect(unknown).toBeNull();
  });
});
