// Forecaster agent (P5): deterministic cash projection and what-if simulation.
import type { AgentContext, Forecast, Scenario } from './types.ts';
import { baselineForecast } from './fixtures.ts';
import { simulateScenario, type MonthlyFlow } from './forecast_math.ts';

export async function forecaster(_ctx: AgentContext, scenario: Scenario): Promise<Forecast> {
  const base = baselineForecast;
  const baselineFlows: MonthlyFlow[] = base.months.map(m => ({
    month: m.month,
    inflow: m.inflow,
    outflow: m.outflow,
  }));

  return simulateScenario(
    {
      startBalance: base.start_balance,
      baselineFlows,
      defaultClientLossMonthly: 1500,
    },
    scenario
  );
}
