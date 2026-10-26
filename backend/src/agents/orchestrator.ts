// Runs Leak Hunter → Explainer → Forecaster → CFO in the background and keeps the latest result.
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTracer, type TraceLine } from '../traces.ts';
import { leakHunter } from './leakHunter.ts';
import { explainer } from './explainer.ts';
import { forecaster } from './forecaster.ts';
import { cfo } from './cfo.ts';
import { drafter } from './drafter.ts';
import { createEngines, type Engines } from '../engines/index.ts';
import { deleteMemory, listMemories, recordDecision } from '../engines/hmemAdapter.ts';
import { getEntity360, ingestZetarisData } from '../engines/worldModelAdapter.ts';
import { countEntities, fetchEntityRows } from '../zetaris/entitySql.ts';
import { describeChanges, diffRuns, type RunDiff } from './changes.ts';

export interface RunChanges extends RunDiff { previous_run_id: string | null }
import type {
  ActionDraft, AgentContext, Brief, Entity360, Explanation, Finding, Forecast, Llm, Memory, Move, RunStatus, RunStep, Scenario,
} from './types.ts';

export interface Agents { leakHunter: typeof leakHunter; explainer: typeof explainer; forecaster: typeof forecaster; cfo: typeof cfo }
export interface RunResult { brief: Brief; findings: Finding[]; forecast: Forecast; explanation: Explanation }
export interface OrchestratorDeps {
  llm: Llm;
  sql: AgentContext['sql'];
  logsDir: string;
  agents?: Partial<Agents>;
  now?: () => Date;
  engines?: Engines;
  hmemPersistDir?: string;
  /** Model used when a call names none (Nightshift's METERLESS_MODEL); only for llm_call trace lines. */
  model?: string;
  deepModel?: string;
}

type TraceFn = (event: string, data?: unknown) => void;
// The step a model call belongs to. Engines call llm.generate outside any AgentContext, so the
// tracer travels with the async call chain instead of being passed in.
const callTrace = new AsyncLocalStorage<TraceFn>();

/** Wraps an Llm so every call writes `llm_call { model, ms, ok }` to the current step's trace. */
export function traceLlm(llm: Llm, defaultModel = 'default'): Llm {
  const timed = async (model: string, call: () => Promise<string>) => {
    const log = callTrace.getStore();
    const t = Date.now();
    try {
      const out = await call();
      log?.('llm_call', { model, ms: Date.now() - t, ok: true });
      return out;
    } catch (e) {
      log?.('llm_call', { model, ms: Date.now() - t, ok: false });
      throw e;
    }
  };
  return {
    ...llm,
    chat: (messages, opts) => timed(opts?.model ?? defaultModel, () => llm.chat(messages, opts)),
    generate: prompt => timed(defaultModel, () => llm.generate(prompt)),
  };
}

export class RunInProgressError extends Error {
  constructor(public runId: string) { super(`run ${runId} is still running`); }
}
export class NotFoundError extends Error {}
export class NoRunYetError extends Error {
  constructor() { super('no finished run yet: POST /api/runs first'); }
}

const DEFAULT_QUESTION = 'Why did my margin drop in September?';

// ponytail: run status and the latest result live in memory and are lost on restart; finished
// results are also saved to logs/runs/ so /api/changes survives a restart.
export function createOrchestrator(deps: OrchestratorDeps) {
  const agents: Agents = { leakHunter, explainer, forecaster, cfo, ...deps.agents };
  const llm = traceLlm(deps.llm, deps.model);
  const hmemDir = deps.hmemPersistDir ?? (deps.logsDir ? join(deps.logsDir, 'hmem') : undefined);
  const engines = deps.engines ?? createEngines(llm, { persistDir: hmemDir });
  const now = deps.now ?? (() => new Date());
  const runs = new Map<string, RunStatus>();
  const done = new Map<string, Promise<RunStatus>>();
  let current: RunResult | null = null;
  let running: string | null = null;
  const runsDir = join(deps.logsDir, 'runs');
  let changes: RunChanges = { previous_run_id: null, new: [], resolved: [], changed: [] };

  /** The newest saved run before runId (ids sort by time). */
  const previousRun = (runId: string): { runId: string; result: RunResult } | null => {
    if (!existsSync(runsDir)) return null;
    const file = readdirSync(runsDir).filter(f => /^run_\d{8}_\d{6}\.json$/.test(f) && f < `${runId}.json`).sort().pop();
    return file ? { runId: file.slice(0, -5), result: JSON.parse(readFileSync(join(runsDir, file), 'utf8')) } : null;
  };

  const ctxFor = (runId: string, step: string | null): AgentContext => {
    const tracer = createTracer(runId, deps.logsDir);
    return { runId, llm, sql: deps.sql, deepModel: deps.deepModel, trace: (event, data) => tracer.log(step, event, data), engines };
  };
  /** Runs an agent with its model calls (its own and the engines') traced to its step. */
  const runAgent = <T>(runId: string, step: string, fn: (ctx: AgentContext) => Promise<T>): Promise<T> => {
    const ctx = ctxFor(runId, step);
    return callTrace.run(ctx.trace, () => fn(ctx));
  };

  async function execute(status: RunStatus): Promise<RunStatus> {
    const tracer = createTracer(status.run_id, deps.logsDir);
    const step = async <T>(name: RunStep, fn: (ctx: AgentContext) => Promise<T>): Promise<T> => {
      status.step = name;
      tracer.log(name, 'start');
      const out = await runAgent(status.run_id, name, fn);
      tracer.log(name, 'done');
      return out;
    };
    try {
      const findings = await step('leak_hunter', async (ctx) => {
        const findings = await agents.leakHunter(ctx);
        // I3: enrich the World Model with full view rows, not just findings.
        // Non-blocking: a Zetaris view hiccup must not fail the morning brief.
        if (engines?.worldModel) {
          try {
            const rows = await fetchEntityRows(ctx.sql);
            await ingestZetarisData(engines.worldModel, { ...rows, findings }, status.run_id);
            ctx.trace('world_model_ingested', { entities: countEntities(rows, findings) });
          } catch (e) {
            // findings are still valid without the entity graph
            ctx.trace('world_model_failed', { error: (e as Error).message });
          }
        }
        return findings;
      });

      // G2: Branch on confidence - findings with confidence !== 'high' escalated to Explainer before CFO ranks them
      const lowConfFindings = findings.filter(f => f.confidence !== 'high');
      if (lowConfFindings.length > 0) {
        tracer.log('explainer', 'escalated', {
          finding_ids: lowConfFindings.map(f => f.id),
          reason: 'low_confidence',
        });
        for (const f of lowConfFindings) {
          try {
            const check = await runAgent(status.run_id, 'explainer', ctx =>
              agents.explainer(ctx, {
                question: `Is finding ${f.id} (${f.title}) supported by its evidence?`,
                finding_id: f.id,
                findings,
              })
            );
            if (check.uncertain) {
              f.title = `${f.title} (unconfirmed: ${check.uncertainty_note ?? 'insufficient evidence'})`;
            }
          } catch {
            // non-blocking
          }
        }
      }

      const explanation = await step('explainer', ctx => agents.explainer(ctx, { question: DEFAULT_QUESTION, finding_id: null, findings }));
      const forecast = await step('forecaster', ctx => agents.forecaster(ctx, { type: 'baseline' }));
      const brief = await step('cfo', ctx => agents.cfo(ctx, { findings, forecast, explanation }));
      // I7: diff against the previous saved run; its lines replace the model's what_changed.
      const prev = previousRun(status.run_id);
      const diff = diffRuns(prev?.result.findings ?? [], findings);
      changes = { previous_run_id: prev?.runId ?? null, ...diff };
      if (prev) {
        const lines = describeChanges(diff, findings);
        brief.what_changed = lines.length ? lines : ['No change since the last run'];
      }
      current = { brief, findings, forecast, explanation };
      mkdirSync(runsDir, { recursive: true });
      writeFileSync(join(runsDir, `${status.run_id}.json`), JSON.stringify(current));
      Object.assign(status, { status: 'done', step: null });
    } catch (e) {
      Object.assign(status, { status: 'failed', error: (e as Error).message });
      tracer.log(status.step, 'run_failed', { error: status.error });
    } finally {
      running = null;
    }
    return status;
  }

  const latest = (): RunResult => {
    if (!current) throw new NoRunYetError();
    return current;
  };

  return {
    startRun(): RunStatus {
      if (running) throw new RunInProgressError(running);
      // ponytail: second-resolution ids collide if two runs start in the same second; add a suffix if that ever matters.
      const run_id = 'run_' + now().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
      const status: RunStatus = { run_id, status: 'running', step: null, error: null };
      runs.set(run_id, status);
      running = run_id;
      // last-resort catch (e.g. logs dir unwritable): never leak an unhandled rejection or a stuck slot
      done.set(run_id, execute(status).catch((e: Error) => {
        Object.assign(status, { status: 'failed', error: e.message });
        running = null;
        return status;
      }));
      return { ...status };
    },
    async wait(runId: string): Promise<RunStatus> {
      const p = done.get(runId);
      if (!p) throw new NotFoundError(`run ${runId} not found`);
      return { ...(await p) };
    },
    getRun(runId: string): RunStatus {
      const s = runs.get(runId);
      if (!s) throw new NotFoundError(`run ${runId} not found`);
      return { ...s };
    },
    latest,
    async explain(question: string, findingId: string | null): Promise<Explanation> {
      const { findings, brief } = latest();
      return runAgent(brief.run_id, 'explainer', ctx => agents.explainer(ctx, { question, finding_id: findingId, findings }));
    },
    async whatIf(scenario: Scenario): Promise<{ baseline: Forecast; scenario: Forecast }> {
      const { forecast, brief } = latest();
      return { baseline: forecast, scenario: await runAgent(brief.run_id, 'forecaster', ctx => agents.forecaster(ctx, scenario)) };
    },
    /** What changed between the latest run and the one before it (contract §5). */
    changes: (): RunChanges => changes,
    /** The run's trace lines (logs/<run_id>.jsonl), in file order. */
    trace(runId: string): TraceLine[] {
      const file = join(deps.logsDir, `${runId}.jsonl`);
      // the id becomes a file name: accept only the run_id shape
      if (!/^run_\d{8}_\d{6}$/.test(runId) || !existsSync(file)) throw new NotFoundError(`no trace for run ${runId}`);
      return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    },
    decide(moveId: string, decision: 'approve' | 'reject', note: string | null): Move {
      const move = latest().brief.moves.find(m => m.id === moveId);
      if (!move) throw new NotFoundError(`move ${moveId} not found`);
      move.status = decision === 'approve' ? 'approved' : 'rejected';
      // P4: store { move, decision, note } in H-MEM here.
      if (engines?.hmem) {
        recordDecision(engines.hmem, move, decision, note);
      }
      return { ...move };
    },
    async draft(moveId: string): Promise<ActionDraft> {
      const { brief, findings } = latest();
      const move = brief.moves.find(m => m.id === moveId);
      if (!move) throw new NotFoundError(`move ${moveId} not found`);
      return runAgent(brief.run_id, 'cfo', ctx => drafter({ move, findings, ctx }));
    },
    memories(): Memory[] {
      return engines?.hmem ? listMemories(engines.hmem) : [];
    },
    deleteMemory(id: string): void {
      if (!engines?.hmem) throw new NotFoundError(`memory ${id} not found`);
      const deleted = deleteMemory(engines.hmem, id);
      if (!deleted) throw new NotFoundError(`memory ${id} not found`);
    },
    entity(id: string): Entity360 {
      if (!engines?.worldModel) throw new NotFoundError(`entity ${id} not found`);
      const findings = current ? current.findings : [];
      const e = getEntity360(engines.worldModel, id, findings);
      if (!e) throw new NotFoundError(`entity ${id} not found`);
      return e;
    },
    engines,
  };
}
