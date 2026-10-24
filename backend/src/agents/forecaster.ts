// Forecaster agent (P5): deterministic cash projection and what-if simulation from Zetaris data.
import type { AgentContext, Forecast, Scenario } from './types.ts';
import { PROJECTION_MONTHS, roundCurrency, simulateScenario, type MonthlyFlow } from './forecast_math.ts';

export const FORECAST_SQL = {
  cash: 'SELECT date, inflow, outflow, balance FROM cash_position',
  clients: 'SELECT client_id, month, revenue_received FROM client_profitability',
} as const;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Baseline = last known balance, then each projected month gets the average monthly inflow/outflow
 * of the history in cash_position.
 * ponytail: flat monthly averages, no seasonality; replace with per-month trend if the demo needs it.
 */
export async function forecaster(ctx: AgentContext, scenario: Scenario): Promise<Forecast> {
  const cash = await ctx.sql(FORECAST_SQL.cash);
  if (!cash.rows.length) throw new Error('cash_position returned no rows: cannot forecast');

  const rows = [...cash.rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const byMonth = new Map<string, { inflow: number; outflow: number }>();
  for (const r of rows) {
    const m = String(r.date).slice(0, 7);
    const acc = byMonth.get(m) ?? { inflow: 0, outflow: 0 };
    acc.inflow += Number(r.inflow || 0);
    acc.outflow += Number(r.outflow || 0);
    byMonth.set(m, acc);
  }
  const months = [...byMonth.values()];
  const inflow = roundCurrency(avg(months.map(m => m.inflow)));
  const outflow = roundCurrency(avg(months.map(m => m.outflow)));
  const baselineFlows: MonthlyFlow[] = PROJECTION_MONTHS.map(month => ({ month, inflow, outflow }));

  const clientRevenues: Record<string, number> = {};
  if (scenario.type === 'lose_client') {
    const clients = await ctx.sql(FORECAST_SQL.clients);
    const received = clients.rows.filter(r => r.client_id === scenario.client_id).map(r => Number(r.revenue_received || 0));
    clientRevenues[scenario.client_id] = roundCurrency(avg(received));
  }

  return simulateScenario(
    { startBalance: Number(rows[rows.length - 1].balance), baselineFlows, clientRevenues, defaultClientLossMonthly: 0 },
    scenario,
  );
}
