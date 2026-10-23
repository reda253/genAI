// STUB (P5 replaces with forecast_math.ts): naive what-if over the fixture baseline.
import type { AgentContext, Forecast, Scenario } from './types.ts';
import { baselineForecast } from './fixtures.ts';

const round = (n: number) => Math.round(n * 100) / 100;

export async function forecaster(_ctx: AgentContext, scenario: Scenario): Promise<Forecast> {
  const base = structuredClone(baselineForecast);
  if (scenario.type === 'baseline') return base;

  let shift = 0;
  const months = base.months.map(m => {
    shift += scenario.type === 'lose_client' ? -1500 : m.inflow * scenario.pct / 100;
    return { ...m, balance: round(m.balance + shift) };
  });
  const firstNegative = months.findIndex(m => m.balance < 0);
  return {
    scenario,
    start_balance: base.start_balance,
    months,
    min_balance: Math.min(...months.map(m => m.balance)),
    runway_months: firstNegative === -1 ? null : firstNegative + 1,
  };
}
