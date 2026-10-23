import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface TraceLine { ts: string; run_id: string; step: string | null; event: string; data?: unknown }
export interface Tracer { log(step: string | null, event: string, data?: unknown): void; file: string }

/** One JSONL file per run: logs/<runId>.jsonl. Sync appends keep line order. */
export function createTracer(runId: string, dir: string): Tracer {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${runId}.jsonl`);
  return {
    file,
    log(step, event, data) {
      const line: TraceLine = { ts: new Date().toISOString(), run_id: runId, step, event, data };
      appendFileSync(file, JSON.stringify(line) + '\n');
    },
  };
}
