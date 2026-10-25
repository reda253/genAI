import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../api';
import type { LlmCallData, TraceLine } from '../types';

/** I8: counts from the run trace. Renders nothing until the trace has model calls. */
export function groundingStats(lines: TraceLine[]) {
  const calls = lines.filter(l => l.event === 'llm_call').map(l => l.data as LlmCallData);
  return {
    calls: calls.length,
    failed: calls.filter(c => !c.ok).length,
    critiqued: lines.filter(l => l.event === 'critique').length,
  };
}

export const GroundingStats: React.FC<{ runId: string }> = ({ runId }) => {
  const [lines, setLines] = useState<TraceLine[]>([]);

  useEffect(() => {
    let alive = true;
    api.getTrace(runId).then(t => alive && setLines(t)).catch(() => alive && setLines([]));
    return () => { alive = false; };
  }, [runId]);

  const s = groundingStats(lines);
  if (!s.calls) return null;
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-400" title="From this run's trace (logs/<run_id>.jsonl)">
      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
      {s.calls} model calls · {s.critiqued} caught by critic · {s.failed} failed
    </span>
  );
};
