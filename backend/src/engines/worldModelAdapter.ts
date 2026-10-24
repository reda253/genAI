// World Model adapter for Ledger Lens — ingests Zetaris views and findings,
// and provides rich context retrieval for agents.
import type { WorldModel, Entity, Fact } from './world-model/index.ts';
import type { Finding } from '../agents/types.ts';

export interface EntityContextSummary {
  id: string;
  entity?: Entity;
  facts: Fact[];
  neighbors: Entity[];
  relatedFindings: Entity[];
  relatedInvoices: Entity[];
  contextSummary: string;
}

export async function ingestZetarisData(
  wm: WorldModel,
  data: {
    clientProfitability?: Record<string, unknown>[];
    subscriptionUsage?: Record<string, unknown>[];
    arAging?: Record<string, unknown>[];
    cashPosition?: Record<string, unknown>[];
    findings?: Finding[];
  },
  runId = 'initial',
): Promise<void> {
  const at = new Date().toISOString();
  const source = { kind: 'zetaris_view', by: 'p4_engines', runId, at };

  // 1. Ingest Clients from client_profitability
  if (data.clientProfitability) {
    for (const row of data.clientProfitability) {
      const clientId = String(row.client_id || '');
      const clientName = String(row.client_name || clientId);
      if (!clientId) continue;

      await wm.upsertEntity({
        type: 'client',
        externalKey: { system: 'zetaris', id: clientId },
        name: clientName,
        attrs: {
          client_id: clientId,
          client_name: clientName,
          hourly_rate: row.hourly_rate,
          market_rate: row.market_rate,
          service: row.service,
        },
        source,
      });

      if (row.unbilled_hours !== undefined) {
        await wm.assertFact({
          about: `client:zetaris:${clientId}`,
          predicate: 'unbilled_hours',
          value: row.unbilled_hours,
          confidence: 1.0,
          source,
        });
      }
      if (row.effective_rate !== undefined) {
        await wm.assertFact({
          about: `client:zetaris:${clientId}`,
          predicate: 'effective_rate',
          value: row.effective_rate,
          confidence: 1.0,
          source,
        });
      }
    }
  }

  // 2. Ingest Subscriptions from subscription_usage
  if (data.subscriptionUsage) {
    for (const row of data.subscriptionUsage) {
      const subId = String(row.subscription_id || '');
      const vendor = String(row.vendor || subId);
      if (!subId) continue;

      await wm.upsertEntity({
        type: 'subscription',
        externalKey: { system: 'zetaris', id: subId },
        name: vendor,
        attrs: {
          subscription_id: subId,
          vendor,
          plan: row.plan,
          monthly_cost: row.monthly_cost,
          days_since_login: row.days_since_login,
          price_change_pct: row.price_change_pct,
          max_charges_in_a_month: row.max_charges_in_a_month,
        },
        source,
      });

      if (row.monthly_cost !== undefined) {
        await wm.assertFact({
          about: `subscription:zetaris:${subId}`,
          predicate: 'monthly_cost',
          value: row.monthly_cost,
          confidence: 1.0,
          source,
        });
      }
    }
  }

  // 3. Ingest Invoices from ar_aging
  if (data.arAging) {
    for (const row of data.arAging) {
      const invId = String(row.invoice_id || '');
      const clientId = String(row.client_id || '');
      if (!invId) continue;

      const invEntity = await wm.upsertEntity({
        type: 'invoice',
        externalKey: { system: 'zetaris', id: invId },
        name: `Invoice ${invId}`,
        attrs: {
          invoice_id: invId,
          client_id: clientId,
          amount: row.amount,
          days_late: row.days_late,
          bucket: row.bucket,
          status: row.status,
        },
        source,
      });

      if (clientId) {
        const clientEntityId = `client:zetaris:${clientId}`;
        await wm.relate({
          from: invEntity.id,
          type: 'billed_to',
          to: clientEntityId,
          source,
        });
      }
    }
  }

  // 4. Ingest Findings
  if (data.findings) {
    for (const finding of data.findings) {
      const findingEntity = await wm.upsertEntity({
        type: 'finding',
        externalKey: { system: 'agent', id: finding.id },
        name: finding.title,
        attrs: {
          finding_id: finding.id,
          type: finding.type,
          title: finding.title,
          monthly_impact_eur: finding.monthly_impact_eur,
          cash_at_risk_eur: finding.cash_at_risk_eur,
          confidence: finding.confidence,
        },
        source,
      });

      if (finding.client_id) {
        const clientEntityId = `client:zetaris:${finding.client_id}`;
        await wm.relate({
          from: findingEntity.id,
          type: 'concerns_client',
          to: clientEntityId,
          source,
        });
      }

      if (finding.subscription_id) {
        const subEntityId = `subscription:zetaris:${finding.subscription_id}`;
        await wm.relate({
          from: findingEntity.id,
          type: 'concerns_subscription',
          to: subEntityId,
          source,
        });
      }
    }
  }
}

export function getEntityContext(wm: WorldModel, rawId: string): EntityContextSummary {
  // Normalize id: accepts "c01", "client:zetaris:c01", "sub02", etc.
  const graph = wm.view('graph');
  const factsView = wm.view('facts');

  let entityId = rawId;
  let entity = graph.entity(entityId);
  if (!entity) {
    // Try prefix matching
    for (const prefix of ['client:zetaris:', 'subscription:zetaris:', 'invoice:zetaris:', 'finding:agent:']) {
      const candidate = graph.entity(`${prefix}${rawId}`);
      if (candidate) {
        entityId = candidate.id;
        entity = candidate;
        break;
      }
    }
  }

  const facts = entity ? factsView.about(entityId) : [];
  const neighbors = entity ? graph.neighborsOf(entityId) : [];

  const relatedFindings = neighbors.filter(n => n.type === 'finding');
  const relatedInvoices = neighbors.filter(n => n.type === 'invoice');

  const summaryParts: string[] = [];
  if (entity) {
    summaryParts.push(`Entity ${entity.name || entity.id} (${entity.type}):`);
    for (const [k, v] of Object.entries(entity.attrs)) {
      summaryParts.push(`  - ${k}: ${v}`);
    }
  }
  if (facts.length > 0) {
    summaryParts.push('Facts:');
    for (const f of facts) {
      summaryParts.push(`  - ${f.predicate}: ${JSON.stringify(f.value)} (confidence: ${f.confidence})`);
    }
  }
  if (neighbors.length > 0) {
    summaryParts.push(`Related items (${neighbors.length}):`);
    for (const n of neighbors) {
      summaryParts.push(`  - ${n.type}: ${n.name || n.id}`);
    }
  }

  return {
    id: entityId,
    entity,
    facts,
    neighbors,
    relatedFindings,
    relatedInvoices,
    contextSummary: summaryParts.join('\n'),
  };
}
