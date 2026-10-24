// Mathematical forecast engine for Ledger Lens.
// Pure deterministic financial calculations for 6-month cash projections and what-if scenarios.
// Strictly adheres to docs/contracts.md §3.

import type { Forecast, ForecastMonth, Scenario } from './types.ts';

export const PROJECTION_MONTHS = [
  '2026-10-01',
  '2026-11-01',
  '2026-12-01',
  '2027-01-01',
  '2027-02-01',
  '2027-03-01',
] as const;

export interface MonthlyFlow {
  month: string;
  inflow: number;
  outflow: number;
}

export interface ClientRevenueInfo {
  clientId: string;
  monthlyAverageRevenue: number;
}

export interface ForecastOptions {
  startBalance: number;
  baselineFlows: MonthlyFlow[];
  clientRevenues?: Record<string, number>; // clientId -> monthly revenue
  defaultClientLossMonthly?: number; // fallback if client not in map (default 1500)
}

/**
 * Rounds a monetary number to 2 decimal places.
 */
export function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Calculates a 6-month cash forecast given a starting balance and monthly inflows/outflows,
 * evaluating min_balance and runway_months (the first month index where balance becomes negative).
 */
export function calculateForecast(
  startBalance: number,
  flows: MonthlyFlow[],
  scenario: Scenario
): Forecast {
  let runningBalance = roundCurrency(startBalance);
  let minBalance = runningBalance;
  let runwayMonths: number | null = null;

  const months: ForecastMonth[] = flows.map((f, index) => {
    const inflow = roundCurrency(f.inflow);
    const outflow = roundCurrency(f.outflow);
    runningBalance = roundCurrency(runningBalance + inflow - outflow);

    if (runningBalance < minBalance) {
      minBalance = runningBalance;
    }

    if (runningBalance < 0 && runwayMonths === null) {
      runwayMonths = index + 1; // 1-based index (1st month, 2nd month, etc.)
    }

    return {
      month: f.month,
      inflow,
      outflow,
      balance: runningBalance,
    };
  });

  return {
    scenario,
    start_balance: roundCurrency(startBalance),
    months,
    min_balance: minBalance,
    runway_months: runwayMonths,
  };
}

/**
 * Simulates a scenario against baseline flows.
 * - 'baseline': unchanged flows.
 * - 'lose_client': deducts the lost client's monthly revenue from projected inflows.
 * - 'raise_prices': increases all inflows by pct%.
 */
export function simulateScenario(
  options: ForecastOptions,
  scenario: Scenario
): Forecast {
  const {
    startBalance,
    baselineFlows,
    clientRevenues = {},
    defaultClientLossMonthly = 1500,
  } = options;

  if (scenario.type === 'baseline') {
    return calculateForecast(startBalance, baselineFlows, scenario);
  }

  if (scenario.type === 'lose_client') {
    const lossPerMonth = clientRevenues[scenario.client_id] ?? defaultClientLossMonthly;
    const adjustedFlows: MonthlyFlow[] = baselineFlows.map(f => ({
      month: f.month,
      inflow: Math.max(0, roundCurrency(f.inflow - lossPerMonth)),
      outflow: f.outflow,
    }));
    return calculateForecast(startBalance, adjustedFlows, scenario);
  }

  if (scenario.type === 'raise_prices') {
    const multiplier = 1 + scenario.pct / 100;
    const adjustedFlows: MonthlyFlow[] = baselineFlows.map(f => ({
      month: f.month,
      inflow: roundCurrency(f.inflow * multiplier),
      outflow: f.outflow,
    }));
    return calculateForecast(startBalance, adjustedFlows, scenario);
  }

  return calculateForecast(startBalance, baselineFlows, scenario);
}
