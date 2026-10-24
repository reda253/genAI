import { describe, expect, it } from 'vitest';
import {
  calculateForecast,
  roundCurrency,
  simulateScenario,
  type MonthlyFlow,
} from '../src/agents/forecast_math.ts';

describe('forecast_math', () => {
  const sampleFlows: MonthlyFlow[] = [
    { month: '2026-10-01', inflow: 6200.00, outflow: 4100.00 },
    { month: '2026-11-01', inflow: 5800.00, outflow: 4150.00 },
    { month: '2026-12-01', inflow: 4900.00, outflow: 4600.00 },
    { month: '2027-01-01', inflow: 5200.00, outflow: 4300.00 },
    { month: '2027-02-01', inflow: 5600.00, outflow: 4200.00 },
    { month: '2027-03-01', inflow: 6000.00, outflow: 4250.00 },
  ];
  const startBalance = 8420.00;

  it('correctly rounds currency to 2 decimals', () => {
    expect(roundCurrency(10.555)).toBe(10.56);
    expect(roundCurrency(10.554)).toBe(10.55);
    expect(roundCurrency(1200)).toBe(1200);
  });

  it('calculates baseline projection with exact monthly balances', () => {
    // Hand calculation:
    // Start: 8420.00
    // M1 (Oct): 8420 + 6200 - 4100 = 10520.00
    // M2 (Nov): 10520 + 5800 - 4150 = 12170.00
    // M3 (Dec): 12170 + 4900 - 4600 = 12470.00
    // M4 (Jan): 12470 + 5200 - 4300 = 13370.00
    // M5 (Feb): 13370 + 5600 - 4200 = 14770.00
    // M6 (Mar): 14770 + 6000 - 4250 = 16520.00
    const forecast = calculateForecast(startBalance, sampleFlows, { type: 'baseline' });

    expect(forecast.scenario).toEqual({ type: 'baseline' });
    expect(forecast.start_balance).toBe(8420.00);
    expect(forecast.months.length).toBe(6);
    expect(forecast.months[0].balance).toBe(10520.00);
    expect(forecast.months[1].balance).toBe(12170.00);
    expect(forecast.months[2].balance).toBe(12470.00);
    expect(forecast.months[3].balance).toBe(13370.00);
    expect(forecast.months[4].balance).toBe(14770.00);
    expect(forecast.months[5].balance).toBe(16520.00);
    expect(forecast.min_balance).toBe(8420.00);
    expect(forecast.runway_months).toBeNull();
  });

  it('detects runway_months when balance goes negative', () => {
    // High outflow flows to force negative balance
    const tightFlows: MonthlyFlow[] = [
      { month: '2026-10-01', inflow: 1000.00, outflow: 5000.00 }, // 2000 + 1000 - 5000 = -2000 -> Month 1
      { month: '2026-11-01', inflow: 1000.00, outflow: 2000.00 },
      { month: '2026-12-01', inflow: 1000.00, outflow: 2000.00 },
      { month: '2027-01-01', inflow: 1000.00, outflow: 2000.00 },
      { month: '2027-02-01', inflow: 1000.00, outflow: 2000.00 },
      { month: '2027-03-01', inflow: 1000.00, outflow: 2000.00 },
    ];
    const forecast = calculateForecast(2000.00, tightFlows, { type: 'baseline' });
    expect(forecast.runway_months).toBe(1);
    expect(forecast.min_balance).toBeLessThan(0);
  });

  it('simulates scenario "lose_client" using client revenue lookup', () => {
    const clientRevenues = { c01: 2000.00, c02: 1200.00 };
    const forecast = simulateScenario(
      {
        startBalance,
        baselineFlows: sampleFlows,
        clientRevenues,
      },
      { type: 'lose_client', client_id: 'c01' }
    );

    expect(forecast.scenario).toEqual({ type: 'lose_client', client_id: 'c01' });
    // Inflows should be reduced by 2000 each month:
    // M1: 6200 - 2000 = 4200. Outflow 4100. Net +100. Balance: 8420 + 100 = 8520.00
    expect(forecast.months[0].inflow).toBe(4200.00);
    expect(forecast.months[0].balance).toBe(8520.00);

    // M2: 5800 - 2000 = 3800. Outflow 4150. Net -350. Balance: 8520 - 350 = 8170.00
    expect(forecast.months[1].inflow).toBe(3800.00);
    expect(forecast.months[1].balance).toBe(8170.00);
  });

  it('simulates scenario "raise_prices" with percentage increase', () => {
    const forecast = simulateScenario(
      {
        startBalance,
        baselineFlows: sampleFlows,
      },
      { type: 'raise_prices', pct: 10 }
    );

    expect(forecast.scenario).toEqual({ type: 'raise_prices', pct: 10 });
    // M1: 6200 * 1.10 = 6820.00. Outflow 4100. Balance: 8420 + 6820 - 4100 = 11140.00
    expect(forecast.months[0].inflow).toBe(6820.00);
    expect(forecast.months[0].balance).toBe(11140.00);
  });
});
