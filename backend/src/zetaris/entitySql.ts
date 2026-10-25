// Full-row Zetaris queries for the World Model (P2 data / I3).
//
// The World Model needs the underlying view rows, not just the six findings:
// clients, subscriptions and invoices become entities that the Client 360
// endpoint and the drawer can read. Keep these queries next to the Leak
// Hunter's SQL_CHECKS style: one SELECT per contract view, no filtering, so
// the adapter sees every row it knows how to ingest.
import type { Finding, QueryResult } from '../agents/types.ts';

export const ENTITY_SQL = {
  clientProfitability: `SELECT client_id, client_name, month, hours_logged, hours_billed, unbilled_hours, unbilled_pct, hourly_rate, market_rate, effective_rate, revenue_invoiced, revenue_received FROM client_profitability`,
  subscriptionUsage: `SELECT subscription_id, vendor, plan, monthly_cost, first_charge_amount, last_charge_amount, price_change_pct, last_login_date, days_since_login, max_charges_in_a_month, total_charged FROM subscription_usage`,
  arAging: `SELECT invoice_id, client_id, client_name, amount, issue_date, due_date, paid_date, days_late, bucket, status FROM ar_aging`,
} as const;

export interface EntityRows {
  clientProfitability: Record<string, unknown>[];
  subscriptionUsage: Record<string, unknown>[];
  arAging: Record<string, unknown>[];
}

/** Run the three full-view queries in parallel through the P2 client. */
export async function fetchEntityRows(
  sql: (query: string) => Promise<QueryResult>,
): Promise<EntityRows> {
  const [clientProfitability, subscriptionUsage, arAging] = await Promise.all([
    sql(ENTITY_SQL.clientProfitability),
    sql(ENTITY_SQL.subscriptionUsage),
    sql(ENTITY_SQL.arAging),
  ]);
  return {
    clientProfitability: clientProfitability.rows,
    subscriptionUsage: subscriptionUsage.rows,
    arAging: arAging.rows,
  };
}

/**
 * Unique entities the adapter will create: one per client, subscription,
 * invoice and finding. Used for the `world_model_ingested` trace line.
 */
export function countEntities(rows: EntityRows, findings: Finding[]): number {
  const ids = new Set<string>();
  for (const row of rows.clientProfitability) {
    if (row.client_id) ids.add(`client:${String(row.client_id)}`);
  }
  for (const row of rows.subscriptionUsage) {
    if (row.subscription_id) ids.add(`subscription:${String(row.subscription_id)}`);
  }
  for (const row of rows.arAging) {
    if (row.invoice_id) ids.add(`invoice:${String(row.invoice_id)}`);
  }
  for (const finding of findings) ids.add(`finding:${finding.id}`);
  return ids.size;
}
