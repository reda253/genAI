import React, { useState, useEffect } from 'react';
import {
  Play,
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
  Search,
  HelpCircle,
  TrendingUp,
  Brain,
  Sparkles,
  Terminal,
  Cpu,
  RefreshCw,
  GitBranch,
} from 'lucide-react';
import { api } from '../api';
import type { RunStep, TraceLine, LlmCallData, CritiqueData } from '../types';
import { GroundingStats } from './GroundingStats';

interface RunModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunComplete: () => void;
}

const STEPS: { key: RunStep; label: string; agent: string; desc: string }[] = [
  {
    key: 'leak_hunter',
    label: 'Leak Hunter Agent',
    agent: 'NVIDIA Nemotron 3.5 Lightning (Fast Lane)',
    desc: 'Scanning Zetaris semantic views for unbilled hours, quiet price hikes & overdue invoices...',
  },
  {
    key: 'explainer',
    label: 'Explainer Agent',
    agent: 'Markovian Engine + Deep Nemotron Ultra',
    desc: 'Investigating margin drops and building cited causal chains from SQL rows with Critic loop...',
  },
  {
    key: 'forecaster',
    label: 'Forecaster Agent',
    agent: 'Mathematical Projection Engine',
    desc: 'Projecting 6-month cash flows and calculating runway milestones...',
  },
  {
    key: 'cfo',
    label: 'CFO Orchestrator',
    agent: 'H-MEM Decision Memory Engine + Nemotron Ultra',
    desc: 'Retrieving past approvals/rejections and ranking the top 3 actionable moves...',
  },
];

export const RunModal: React.FC<RunModalProps> = ({ isOpen, onClose, onRunComplete }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<RunStep | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [traceLines, setTraceLines] = useState<TraceLine[]>([]);
  const [showTraceStream, setShowTraceStream] = useState(true);
  const traceEndRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showTraceStream && traceLines.length > 0) {
      traceEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [traceLines, showTraceStream]);

  // Poll status & trace
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    if (isRunning && runId && !isDone) {
      const poll = async () => {
        try {
          const [status, trace] = await Promise.all([
            api.getRun(runId),
            api.getTrace(runId).catch(() => []),
          ]);

          if (trace && trace.length > 0) {
            setTraceLines(trace);
          }

          if (status.status === 'running') {
            setCurrentStep(status.step);
            timer = setTimeout(poll, 700);
          } else if (status.status === 'done') {
            setIsRunning(false);
            setIsDone(true);
            setCurrentStep(null);
            // Fetch final trace lines
            api.getTrace(runId).then((finalTrace) => setTraceLines(finalTrace)).catch(() => {});
            onRunComplete();
          } else if (status.status === 'failed') {
            setIsRunning(false);
            setError(status.error || 'Agent execution failed');
          }
        } catch (err: any) {
          setError(err.message || 'Polling error');
          setIsRunning(false);
        }
      };
      poll();
    }

    return () => clearTimeout(timer);
  }, [isRunning, runId, isDone, onRunComplete]);

  if (!isOpen) return null;

  const handleStartRun = async () => {
    setError(null);
    setIsDone(false);
    setIsRunning(true);
    setTraceLines([]);
    setCurrentStep('leak_hunter');
    try {
      const res = await api.startRun();
      setRunId(res.run_id);
    } catch (err: any) {
      setError(err.message || 'Failed to start run');
      setIsRunning(false);
    }
  };

  const getStepStatus = (_stepKey: RunStep, index: number) => {
    if (isDone) return 'done';
    if (!currentStep) return 'pending';
    const currentIdx = STEPS.findIndex((s) => s.key === currentStep);
    if (index < currentIdx) return 'done';
    if (index === currentIdx) return 'active';
    return 'pending';
  };

  const getStepIcon = (key: RunStep) => {
    switch (key) {
      case 'leak_hunter':
        return <Search className="w-4 h-4" />;
      case 'explainer':
        return <HelpCircle className="w-4 h-4" />;
      case 'forecaster':
        return <TrendingUp className="w-4 h-4" />;
      case 'cfo':
        return <Brain className="w-4 h-4" />;
    }
  };

  const formatTraceEvent = (line: TraceLine) => {
    switch (line.event) {
      case 'checks_done': {
        const d = line.data as { ran?: number; failed?: number };
        return {
          icon: <Search className="w-3.5 h-3.5 text-emerald-400" />,
          title: `${d?.ran ?? 6} SQL Checks on Zetaris${d?.failed ? ` · ${d.failed} failed` : ''}`,
          subtitle: 'Scanned client_profitability, subscription_usage, ar_aging, cash_position',
          badge: 'ZETARIS',
          badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        };
      }
      case 'llm_call': {
        const d = line.data as LlmCallData;
        const isLightning = d?.model?.toLowerCase().includes('lightning');
        return {
          icon: <Cpu className="w-3.5 h-3.5 text-cyan-400" />,
          title: `${d?.model ?? 'Nemotron'} · ${(d?.ms ? (d.ms / 1000).toFixed(1) + 's' : 'done')}`,
          subtitle: d?.ok ? 'Inference output verified & schema-validated' : 'Fallback triggered',
          badge: isLightning ? 'NVIDIA LIGHTNING' : 'NVIDIA ULTRA',
          badgeClass: isLightning
            ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
            : 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        };
      }
      case 'markovian_done': {
        const d = line.data as { chunks?: number };
        return {
          icon: <Sparkles className="w-3.5 h-3.5 text-teal-400" />,
          title: `Markovian Engine · ${d?.chunks ?? 3} Causal Chunks`,
          subtitle: 'Ranked causal evidence pathways for margin fluctuations',
          badge: 'METERLESS MARKOVIAN',
          badgeClass: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
        };
      }
      case 'critique': {
        const d = line.data as CritiqueData;
        const n = d?.problems?.length ?? 1;
        return {
          icon: <RefreshCw className="w-3.5 h-3.5 text-amber-400" />,
          title: `Critic (${d?.agent ?? 'agent'}): ${n} problem${n === 1 ? '' : 's'} → ${d?.revised ? 'revised' : 'backup answer used'}`,
          subtitle: d?.problems?.[0] ?? 'G1 critic loop checked the answer against the evidence',
          badge: 'CRITIC LOOP (G1)',
          badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        };
      }
      case 'memory_applied': {
        const d = line.data as { count?: number; text?: string };
        return {
          icon: <Brain className="w-3.5 h-3.5 text-violet-400" />,
          title: `H-MEM · ${d?.count ?? 1} Decision Memory Applied`,
          subtitle: d?.text ?? 'Sara past approval/rejection preferences weighted in ranking',
          badge: 'METERLESS H-MEM',
          badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
        };
      }
      case 'escalated': {
        return {
          icon: <GitBranch className="w-3.5 h-3.5 text-rose-400" />,
          title: 'Escalation: Low-Confidence Finding Verified',
          subtitle: 'G2 Confidence branch routed finding to Explainer before CFO ranking',
          badge: 'G2 ESCALATED',
          badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        };
      }
      case 'world_model_ingested': {
        const d = line.data as { entities?: number };
        return {
          icon: <Sparkles className="w-3.5 h-3.5 text-teal-400" />,
          title: `World Model · ${d?.entities ?? 0} entities ingested`,
          subtitle: 'Clients and subscriptions linked to their findings for Client 360',
          badge: 'METERLESS WORLD MODEL',
          badgeClass: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
        };
      }
      // start/done mark each agent step, not the whole run
      case 'start':
      case 'done': {
        const label = STEPS.find((s) => s.key === line.step)?.label ?? line.step ?? 'Step';
        return {
          icon: line.event === 'start'
            ? <Play className="w-3.5 h-3.5 text-emerald-400" />
            : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
          title: `${label} ${line.event === 'start' ? 'started' : 'finished'}`,
          subtitle: `Run ${line.run_id}`,
          badge: 'ORCHESTRATOR',
          badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
        };
      }
      default:
        return {
          icon: <Terminal className="w-3.5 h-3.5 text-slate-400" />,
          title: `Agent Event: ${line.event}`,
          subtitle: line.step ? `Step: ${line.step}` : 'System event',
          badge: 'EVENT',
          badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
        };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity"
        onClick={!isRunning ? onClose : undefined}
      />

      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden z-10 animate-fade-in flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-925/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white tracking-tight">Autonomous Finance Run</h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                  CONTRACT V1.1
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Live Multi-Agent Orchestration • Nemotron Lightning & Ultra • Meterless Engines
              </p>
            </div>
          </div>
          {!isRunning && (
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 flex items-start gap-3 text-sm">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Execution Interrupted</div>
                <div className="text-xs text-rose-300/90">{error}</div>
              </div>
            </div>
          )}

          {/* Stepper */}
          <div className="space-y-2.5">
            {STEPS.map((step, idx) => {
              const status = getStepStatus(step.key, idx);
              return (
                <div
                  key={step.key}
                  className={`p-3.5 rounded-2xl border transition-all duration-300 ${
                    status === 'active'
                      ? 'bg-slate-800/80 border-emerald-500/50 shadow-glow-emerald'
                      : status === 'done'
                      ? 'bg-slate-950/60 border-slate-800/80'
                      : 'bg-slate-950/30 border-slate-800/40 opacity-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-mono font-bold ${
                          status === 'active'
                            ? 'bg-emerald-500 text-slate-950'
                            : status === 'done'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {status === 'active' ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : status === 'done' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          getStepIcon(step.key)
                        )}
                      </div>
                      <span className="font-semibold text-sm text-white">{step.label}</span>
                    </div>

                    <span className="text-[11px] font-mono text-slate-400">{step.agent}</span>
                  </div>

                  <p className="text-xs text-slate-300/80 pl-8.5 leading-relaxed">{step.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Live Agent Trace Stream Section (I1 / M3) */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                Live Agent Trace Stream (I1 / Nemotron Models)
              </div>
              <button
                onClick={() => setShowTraceStream(!showTraceStream)}
                className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 cursor-pointer"
              >
                {showTraceStream ? 'Hide Feed' : `Show Feed (${traceLines.length})`}
              </button>
            </div>

            {showTraceStream && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3.5 max-h-56 overflow-y-auto space-y-2 shadow-inner font-mono text-xs">
                {traceLines.length === 0 ? (
                  <div className="py-6 text-center text-slate-500 italic">
                    {isRunning
                      ? 'Streaming agent execution traces from GET /api/runs/:id/trace...'
                      : 'Launch an analysis run to observe live model calls & critic feedback.'}
                  </div>
                ) : (
                  traceLines.map((line, idx) => {
                    const parsed = formatTraceEvent(line);
                    return (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 flex items-start justify-between gap-3 animate-fade-in"
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="mt-0.5 shrink-0">{parsed.icon}</span>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-200 text-xs">
                              {parsed.title}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {parsed.subtitle}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`text-[9px] px-2 py-0.5 rounded border uppercase shrink-0 font-bold ${parsed.badgeClass}`}
                        >
                          {parsed.badge}
                        </span>
                      </div>
                    );
                  })
                )}
                <div ref={traceEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-800 bg-slate-925/90 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-400 font-mono">
              {runId ? `Run: ${runId}` : 'Ready for execution'}
            </div>
            {runId && (
              <div className="hidden sm:block">
                <GroundingStats runId={runId} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {!isRunning && !isDone && (
              <button
                onClick={handleStartRun}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-glow-emerald transition-all duration-200 flex items-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                Launch Analysis
              </button>
            )}

            {isRunning && (
              <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Agents reasoning in parallel...
              </div>
            )}

            {isDone && (
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-400 text-slate-950 font-bold text-xs shadow-glow-emerald transition-all duration-200 flex items-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                View Updated Brief
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
