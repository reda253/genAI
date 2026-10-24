// Runs Leak Hunter → Explainer → Forecaster → CFO in the background and keeps the latest result.
import { createTracer } from '../traces.ts';
import { leakHunter } from './leakHunter.ts';
import { explainer } from './explainer.ts';
import { forecaster } from './forecaster.ts';
import { cfo } from './cfo.ts';
import type {
  AgentContext, Brief, Explanation, Finding, Forecast, Llm, Move, RunStatus, RunStep, Scenario,
} from './types.ts';

export interface Agents { leakHunter: typeof leakHunter; explainer: typeof explainer; forecaster: typeof forecaster; cfo: typeof cfo }
export interface RunResult { brief: Brief; findings: Finding[]; forecast: Forecast; explanation: Explanation }
export interface OrchestratorDeps {
  llm: Llm; sql: AgentContext['sql']; logsDir: string; agents?: Partial<Agents>; now?: () => Date; deepModel?: string;
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
  const now = deps.now ?? (() => new Date());
  const runs = new Map<string, RunStatus>();
  const done = new Map<string, Promise<RunStatus>>();
  let current: RunResult | null = null;
  let running: string | null = null;

  const ctxFor = (runId: string, step: string | null): AgentContext => {
    const tracer = createTracer(runId, deps.logsDir);
    return { runId, llm: deps.llm, sql: deps.sql, deepModel: deps.deepModel, trace: (event, data) => tracer.log(step, event, data) };
  };

  async function execute(status: RunStatus): Promise<RunStatus> {
    const tracer = createTracer(status.run_id, deps.logsDir);
    const step = async <T>(name: RunStep, fn: (ctx: AgentContext) => Promise<T>): Promise<T> => {
      status.step = name;
      tracer.log(name, 'start');
      const out = await fn(ctxFor(status.run_id, name));
      tracer.log(name, 'done');
      return out;
    };
    try {
      const findings = await step('leak_hunter', ctx => agents.leakHunter(ctx));
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
      return agents.explainer(ctxFor(brief.run_id, 'explainer'), { question, finding_id: findingId, findings });
    },
    async whatIf(scenario: Scenario): Promise<{ baseline: Forecast; scenario: Forecast }> {
      const { forecast, brief } = latest();
      return { baseline: forecast, scenario: await agents.forecaster(ctxFor(brief.run_id, 'forecaster'), scenario) };
    },
    decide(moveId: string, decision: 'approve' | 'reject', note: string | null): Move {
      const move = latest().brief.moves.find(m => m.id === moveId);
      if (!move) throw new NotFoundError(`move ${moveId} not found`);
      move.status = decision === 'approve' ? 'approved' : 'rejected';
      // P4: store { move, decision, note } in H-MEM here.
      void note;
      return { ...move };
    },
  };
}
