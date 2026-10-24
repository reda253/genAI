import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../../src/server.ts';
import { createOrchestrator } from '../../src/agents/orchestrator.ts';
import { createEngines } from '../../src/engines/index.ts';
import type { Llm } from '../../src/agents/types.ts';
import { getEntityContext } from '../../src/engines/worldModelAdapter.ts';

const nope = () => Promise.reject(new Error('unused'));
const fakeLlm: Llm = { chat: nope, generate: nope, listModels: nope };

describe('Demo Memory Moment (H-MEM + World Model live integration)', () => {
  it('rejecting a move persists in H-MEM and modifies subsequent CFO brief rankings and memory_notes', async () => {
    const logsDir = mkdtempSync(join(tmpdir(), 'memory-demo-'));
    const engines = createEngines(fakeLlm);
    const orchestrator = createOrchestrator({
      llm: fakeLlm,
      engines,
      logsDir,
      sql: nope,
    });
    const app = buildServer({
      orchestrator,
      checks: { zetaris: async () => true, nightshift: async () => true },
    });

    // 1. Initial Run (Morning Brief)
    const run1Res = await app.inject({ method: 'POST', url: '/api/runs' });
    expect(run1Res.statusCode).toBe(202);
    const run1Id = run1Res.json().run_id;
    await orchestrator.wait(run1Id);

    // 2. Fetch Initial Brief
    const brief1Res = await app.inject({ method: 'GET', url: '/api/brief' });
    expect(brief1Res.statusCode).toBe(200);
    const brief1 = brief1Res.json();

    expect(brief1.moves).toHaveLength(3);
    const initialM003 = brief1.moves.find((m: any) => m.id === 'm003');
    expect(initialM003).toBeDefined();
    expect(initialM003.status).toBe('pending');
    expect(initialM003.memory_note).toBeNull();
    expect(initialM003.urgency).toBe('medium');

    // 3. Sara acts: Sara REJECTS move m003 (Cancel unused Webflow plan)
    const decisionRes = await app.inject({
      method: 'POST',
      url: '/api/moves/m003/decision',
      payload: {
        decision: 'reject',
        note: 'Need Webflow for active client staging site',
      },
    });
    expect(decisionRes.statusCode).toBe(200);
    expect(decisionRes.json().status).toBe('rejected');

    // 4. Trigger Next Run (The "Memory Moment")
    const run2Res = await app.inject({ method: 'POST', url: '/api/runs' });
    expect(run2Res.statusCode).toBe(202);
    const run2Id = run2Res.json().run_id;
    await orchestrator.wait(run2Id);

    // 5. Fetch New Brief after second run
    const brief2Res = await app.inject({ method: 'GET', url: '/api/brief' });
    expect(brief2Res.statusCode).toBe(200);
    const brief2 = brief2Res.json();

    const rememberedM003 = brief2.moves.find((m: any) => m.id === 'm003');
    expect(rememberedM003).toBeDefined();
    // Verification: H-MEM memory note is dynamically attached to the move
    expect(rememberedM003.memory_note).toContain('previously rejected');
    // Urgency was lowered from 'medium' to 'low'
    expect(rememberedM003.urgency).toBe('low');

    // 6. World Model fact store verification: findings were ingested
    const f001Ctx = getEntityContext(engines.worldModel, 'f001');
    expect(f001Ctx.entity).toBeDefined();
    expect(f001Ctx.entity?.attrs.title).toBe('Nordwind Studio pays 47 days late on average');
  });
});
