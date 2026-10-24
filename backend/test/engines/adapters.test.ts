import { describe, expect, it } from 'vitest';
import { createEngines } from '../../src/engines/index.ts';
import { ingestZetarisData, getEntityContext } from '../../src/engines/worldModelAdapter.ts';
import { recordDecision, applyMemoriesToMoves } from '../../src/engines/hmemAdapter.ts';
import { runExplainerInvestigation } from '../../src/engines/markovianAdapter.ts';
import { findings, moves } from '../../src/agents/fixtures.ts';

describe('Meterless Engine Adapters', () => {
  it('World Model: ingests Zetaris views and retrieves rich entity context', async () => {
    const { worldModel } = createEngines();

    await ingestZetarisData(worldModel, {
      clientProfitability: [
        { client_id: 'c01', client_name: 'Atlas Co', hourly_rate: 60, market_rate: 60, unbilled_hours: 22 },
        { client_id: 'c04', client_name: 'Nordwind Studio', hourly_rate: 70, market_rate: 70, unbilled_hours: 0 },
      ],
      subscriptionUsage: [
        { subscription_id: 'sub02', vendor: 'Adobe', monthly_cost: 80.99, days_since_login: 2 },
        { subscription_id: 'sub05', vendor: 'Webflow', monthly_cost: 29.00, days_since_login: 94 },
      ],
      arAging: [
        { invoice_id: 'inv0031', client_id: 'c04', amount: 2400.00, days_late: 47, status: 'overdue' },
      ],
      findings,
    });

    // Check entity context for client c01
    const ctxAtlas = getEntityContext(worldModel, 'c01');
    expect(ctxAtlas.entity).toBeDefined();
    expect(ctxAtlas.entity?.attrs.client_name).toBe('Atlas Co');
    expect(ctxAtlas.facts.some(f => f.predicate === 'unbilled_hours' && f.value === 22)).toBe(true);
    expect(ctxAtlas.relatedFindings.length).toBeGreaterThan(0);
    expect(ctxAtlas.contextSummary).toContain('Atlas Co');

    // Check entity context for invoice inv0031
    const ctxInv = getEntityContext(worldModel, 'inv0031');
    expect(ctxInv.entity).toBeDefined();
    expect(ctxInv.entity?.attrs.amount).toBe(2400.00);
    expect(ctxInv.neighbors.some(n => n.id.includes('c04'))).toBe(true);

    // Check entity context for finding f001
    const ctxFinding = getEntityContext(worldModel, 'f001');
    expect(ctxFinding.entity).toBeDefined();
    expect(ctxFinding.entity?.attrs.type).toBe('late_payer');
    expect(ctxFinding.neighbors.some(n => n.id.includes('c04'))).toBe(true);
  });

  it('H-MEM: stores decisions and adapts move ranking based on past user memory', () => {
    const { hmem } = createEngines();
    const testMoves = structuredClone(moves);

    // Baseline: moves[2] is m003 (cancel Webflow) with rank 3, urgency medium
    expect(testMoves[2].id).toBe('m003');
    expect(testMoves[2].memory_note).toBeNull();

    // User rejects move m003
    const memory = recordDecision(hmem, testMoves[2], 'reject', 'Still need Webflow for portfolio');
    expect(memory).toBeDefined();
    expect(memory.category).toBe('preference');
    expect(memory.text).toContain('REJECTED');
    expect(memory.text).toContain('Webflow');

    // Apply memories to moves
    const reranked = applyMemoriesToMoves(hmem, testMoves);

    // Move m003 should have a memory_note explaining the rejection and lower urgency
    const adjustedM003 = reranked.find(m => m.id === 'm003')!;
    expect(adjustedM003.memory_note).toContain('previously rejected');
    expect(adjustedM003.urgency).toBe('low');
  });

  it('H-MEM: memories re-rank moves but never change the money shown to the user', () => {
    const { hmem } = createEngines();
    const testMoves = structuredClone(moves);
    recordDecision(hmem, testMoves[0], 'reject', null);  // m001 bill_hours 1320
    recordDecision(hmem, testMoves[2], 'approve', null); // m003 cancel Webflow 29
    const reranked = applyMemoriesToMoves(hmem, testMoves);
    for (const m of reranked) {
      expect(m.monthly_impact_eur).toBe(moves.find(o => o.id === m.id)!.monthly_impact_eur);
    }
    expect(reranked.map(m => m.rank)).toEqual([1, 2, 3]);
  });

  it('Markovian: runs chunked hypothesis investigation with carryover', async () => {
    const { markovian } = createEngines();

    const result = await runExplainerInvestigation(markovian, {
      question: 'Why did my margin drop in September?',
      findingId: null,
      findings: [findings[1], findings[4]], // f002 (unbilled hours 1320 EUR) and f005 (underpriced 540 EUR)
    });

    expect(result.chunkCount).toBeGreaterThan(0);
    expect(result.explanation.question).toBe('Why did my margin drop in September?');
    expect(result.explanation.causes).toHaveLength(2);
    expect(result.explanation.causes[0].finding_id).toBe('f002');
    expect(result.explanation.causes[0].amount_eur).toBe(1320.00);
    expect(result.explanation.causes[1].finding_id).toBe('f005');
    expect(result.explanation.causes[1].amount_eur).toBe(540.00);
    expect(result.explanation.summary).toContain('Atlas Co');
  });
});
