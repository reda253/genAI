import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../../src/server.ts';
import { createOrchestrator } from '../../src/agents/orchestrator.ts';
import type { Llm } from '../../src/agents/types.ts';
import { mockSql } from '../helpers.ts';

const nope = () => Promise.reject(new Error('unused'));
const fakeLlm: Llm = { chat: nope, generate: nope, listModels: nope };

describe('H-MEM Memory Persistence & Endpoints (Task I4)', () => {
  it('GET /api/memories works without any run and returns [] initially', async () => {
    const logsDir = mkdtempSync(join(tmpdir(), 'hmem-test-'));
    const orchestrator = createOrchestrator({ llm: fakeLlm, sql: nope, logsDir });
    const app = buildServer({
      orchestrator,
      checks: { zetaris: async () => true, nightshift: async () => 'online' },
    });

    const res = await app.inject({ method: 'GET', url: '/api/memories' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('stores decisions, lists them newest first, persists to disk, and allows deleting them', async () => {
    const logsDir = mkdtempSync(join(tmpdir(), 'hmem-persist-'));
    const orchestrator = createOrchestrator({ llm: fakeLlm, sql: mockSql, logsDir });
    const app = buildServer({
      orchestrator,
      checks: { zetaris: async () => true, nightshift: async () => 'online' },
    });

    // 1. Start a run to populate moves
    const runRes = await app.inject({ method: 'POST', url: '/api/runs' });
    await orchestrator.wait(runRes.json().run_id);

    // 2. Sara approves m002 and rejects m001
    await app.inject({
      method: 'POST',
      url: '/api/moves/m002/decision',
      payload: { decision: 'approve', note: 'Looks good' },
    });

    await app.inject({
      method: 'POST',
      url: '/api/moves/m001/decision',
      payload: { decision: 'reject', note: 'Too aggressive' },
    });

    // 3. GET /api/memories lists both decisions, newest first
    const listRes = await app.inject({ method: 'GET', url: '/api/memories' });
    expect(listRes.statusCode).toBe(200);
    const memories = listRes.json();
    expect(memories).toHaveLength(2);
    // Newest is m001 rejection
    expect(memories[0].decision).toBe('reject');
    expect(memories[0].text).toContain('REJECTED');
    expect(memories[0].created_at).toBeDefined();
    // Oldest is m002 approval
    expect(memories[1].decision).toBe('approve');
    expect(memories[1].text).toContain('APPROVED');

    // 4. Verify disk persistence: state.json exists in logsDir/hmem
    const stateFile = join(logsDir, 'hmem', 'state.json');
    expect(existsSync(stateFile)).toBe(true);

    // 5. Simulate server restart: create a new orchestrator pointing to the same logsDir
    const restartedOrchestrator = createOrchestrator({ llm: fakeLlm, sql: mockSql, logsDir });
    const restartedApp = buildServer({
      orchestrator: restartedOrchestrator,
      checks: { zetaris: async () => true, nightshift: async () => 'online' },
    });

    const reloadedMemoriesRes = await restartedApp.inject({ method: 'GET', url: '/api/memories' });
    expect(reloadedMemoriesRes.statusCode).toBe(200);
    expect(reloadedMemoriesRes.json()).toHaveLength(2);
    expect(reloadedMemoriesRes.json()[0].id).toBe(memories[0].id);

    // 6. Delete the rejection memory
    const memoryToDeleteId = memories[0].id;
    const deleteRes = await restartedApp.inject({
      method: 'DELETE',
      url: `/api/memories/${memoryToDeleteId}`,
    });
    expect(deleteRes.statusCode).toBe(204);

    // 7. Verify memory is gone
    const afterDeleteRes = await restartedApp.inject({ method: 'GET', url: '/api/memories' });
    expect(afterDeleteRes.statusCode).toBe(200);
    expect(afterDeleteRes.json()).toHaveLength(1);
    expect(afterDeleteRes.json()[0].id).toBe(memories[1].id);

    // 8. Deleting unknown memory returns 404
    const notFoundRes = await restartedApp.inject({
      method: 'DELETE',
      url: '/api/memories/mem-9999',
    });
    expect(notFoundRes.statusCode).toBe(404);
    expect(notFoundRes.json().error.code).toBe('not_found');
  });

  it('forgetting a memory stops it from affecting future CFO rankings', async () => {
    const logsDir = mkdtempSync(join(tmpdir(), 'hmem-forget-'));
    const orchestrator = createOrchestrator({ llm: fakeLlm, sql: mockSql, logsDir });
    const app = buildServer({
      orchestrator,
      checks: { zetaris: async () => true, nightshift: async () => 'online' },
    });

    // Run 1: baseline
    const r1 = await app.inject({ method: 'POST', url: '/api/runs' });
    await orchestrator.wait(r1.json().run_id);

    // Sara rejects m001
    await app.inject({
      method: 'POST',
      url: '/api/moves/m001/decision',
      payload: { decision: 'reject', note: 'Not now' },
    });

    // Run 2: memory should affect m001 (downgraded urgency and memory_note set)
    const r2 = await app.inject({ method: 'POST', url: '/api/runs' });
    await orchestrator.wait(r2.json().run_id);
    const brief2Res = await app.inject({ method: 'GET', url: '/api/brief' });
    const m001Run2 = brief2Res.json().moves.find((m: any) => m.id === 'm001');
    expect(m001Run2.memory_note).toContain('previously rejected');

    // Get memory ID and forget it via DELETE /api/memories/:id
    const memoriesRes = await app.inject({ method: 'GET', url: '/api/memories' });
    const memoryId = memoriesRes.json()[0].id;
    const delRes = await app.inject({ method: 'DELETE', url: `/api/memories/${memoryId}` });
    expect(delRes.statusCode).toBe(204);

    // Run 3: after forgetting, m001 should no longer have a rejection memory note
    const r3 = await app.inject({ method: 'POST', url: '/api/runs' });
    await orchestrator.wait(r3.json().run_id);
    const brief3Res = await app.inject({ method: 'GET', url: '/api/brief' });
    const m001Run3 = brief3Res.json().moves.find((m: any) => m.id === 'm001');
    expect(m001Run3.memory_note).toBeNull();
  });
});
