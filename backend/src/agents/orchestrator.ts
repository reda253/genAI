// Runs Leak Hunter → Explainer → Forecaster → CFO in the background and keeps the latest result.
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTracer, type TraceLine } from '../traces.ts';
import { leakHunter } from './leakHunter.ts';
import { explainer } from './explainer.ts';
import { forecaster } from './forecaster.ts';
import { cfo } from './cfo.ts';
import { createEngines, type Engines } from '../engines/index.ts';
import { recordDecision } from '../engines/hmemAdapter.ts';
import { ingestZetarisData } from '../engines/worldModelAdapter.ts';
import { countEntities, fetchEntityRows } from '../zetaris/entitySql.ts';
import type {
  AgentContext, Brief, Explanation, Finding, Forecast, Llm, Move, RunStatus, RunStep, Scenario,
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

// ponytail: in-memory only, runs are lost on restart; persist when the demo needs history.
export function createOrchestrator(deps: OrchestratorDeps) {
  const agents: Agents = { leakHunter, explainer, forecaster, cfo, ...deps.agents };
  const llm = traceLlm(deps.llm, deps.model);
  const engines = deps.engines ?? createEngines(llm);
  const now = deps.now ?? (() => new Date());
  const runs = new Map<string, RunStatus>();
  const done = new Map<string, Promise<RunStatus>>();
  let current: RunResult | null = null;
  let running: string | null = null;

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
      const explanation = await step('explainer', ctx => agents.explainer(ctx, { question: DEFAULT_QUESTION, finding_id: null, findings }));
      const forecast = await step('forecaster', ctx => agents.forecaster(ctx, { type: 'baseline' }));
      const brief = await step('cfo', ctx => agents.cfo(ctx, { findings, forecast, explanation }));
      current = { brief, findings, forecast, explanation };
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
    engines,
  };
}
