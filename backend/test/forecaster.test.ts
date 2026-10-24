import { forecaster } from '../src/agents/forecaster.ts';
import type { AgentContext } from '../src/agents/types.ts';
import { fakeLlm, mockSql } from './helpers.ts';

const ctx = (sql: AgentContext['sql']): AgentContext => ({ runId: 'run_fc', llm: fakeLlm, sql, trace: () => {} });

test('baseline comes from the cash_position view, not fixtures', async () => {
  const f = await forecaster(ctx(mockSql), { type: 'baseline' });
  expect(f.start_balance).toBe(8420); // closing balance on 2026-09-30 in data-v1
  expect(f.months.map(m => m.month)).toEqual(
    ['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01']);
  // monthly averages of Apr-Sep 2026: receipts 52422.00 / 6, expenses 48802.00 / 6
  expect(f.months[0].inflow).toBe(8737);
  expect(f.months[0].outflow).toBeCloseTo(8133.67, 2);
});

test("lose_client removes that client's average monthly revenue", async () => {
  const base = await forecaster(ctx(mockSql), { type: 'baseline' });
  const lost = await forecaster(ctx(mockSql), { type: 'lose_client', client_id: 'c01' });
  expect(lost.months[0].inflow).toBe(base.months[0].inflow - 2400); // Atlas Co pays 2400.00/month
});

test('Zetaris failure fails the forecast instead of inventing numbers', async () => {
  await expect(forecaster(ctx(() => Promise.reject(new Error('zetaris down'))), { type: 'baseline' }))
    .rejects.toThrow(/zetaris down/);
});
