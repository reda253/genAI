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
} from 'lucide-react';
import { api } from '../api';
import type { RunStep } from '../types';

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
    agent: 'Markovian Engine + Deep Nemotron',
    desc: 'Investigating margin drops and building cited causal chains from SQL rows...',
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
    agent: 'H-MEM Decision Memory Engine',
    desc: 'Retrieving past approvals/rejections and ranking the top 3 actionable moves...',
  },
];

export const RunModal: React.FC<RunModalProps> = ({ isOpen, onClose, onRunComplete }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState<RunStep | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    if (isRunning && runId && !isDone) {
      const poll = async () => {
        try {
          const status = await api.getRun(runId);
          if (status.status === 'running') {
            setCurrentStep(status.step);
            timer = setTimeout(poll, 700);
          } else if (status.status === 'done') {
            setIsRunning(false);
            setIsDone(true);
            setCurrentStep(null);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={!isRunning ? onClose : undefined} />

      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden z-10 animate-fade-in">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-925/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">Autonomous Finance Run</h3>
              <p className="text-xs text-slate-400 font-mono">Orchestrating 4 Specialized AI Agents</p>
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

        {/* Content */}
        <div className="p-6 space-y-6">
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
          <div className="space-y-3">
            {STEPS.map((step, idx) => {
              const status = getStepStatus(step.key, idx);
              return (
                <div
                  key={step.key}
                  className={`p-4 rounded-2xl border transition-all duration-300 ${
                    status === 'active'
                      ? 'bg-slate-800/80 border-emerald-500/50 shadow-glow-emerald'
                      : status === 'done'
                      ? 'bg-slate-950/60 border-slate-800/80'
                      : 'bg-slate-950/30 border-slate-800/40 opacity-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-mono font-bold ${
                          status === 'active'
                            ? 'bg-emerald-500 text-slate-950'
                            : status === 'done'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {status === 'active' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : status === 'done' ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          getStepIcon(step.key)
                        )}
                      </div>
                      <span className="font-semibold text-sm text-white">{step.label}</span>
                    </div>

                    <span className="text-[11px] font-mono text-slate-400">{step.agent}</span>
                  </div>

                  <p className="text-xs text-slate-300/80 pl-9.5 leading-relaxed">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-800 bg-slate-925/80 flex items-center justify-between">
          <div className="text-xs text-slate-400 font-mono">
            {runId ? `Run ID: ${runId}` : 'Ready for execution'}
          </div>

          <div className="flex items-center gap-3">
            {!isRunning && !isDone && (
              <button
                onClick={handleStartRun}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-glow-emerald transition-all duration-200 flex items-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                <Play className="w-4 h-4 fill-white" />
                Launch Analysis
              </button>
            )}

            {isRunning && (
              <div className="flex items-center gap-2 text-sm text-emerald-400 font-mono">
                <Loader2 className="w-4 h-4 animate-spin" />
                Agents computing in parallel...
              </div>
            )}

            {isDone && (
              <button
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-slate-950 font-bold text-sm shadow-glow-emerald transition-all duration-200 flex items-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                <CheckCircle2 className="w-4 h-4" />
                View Updated Brief
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
