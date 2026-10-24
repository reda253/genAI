import React, { useState } from 'react';
import {
  HelpCircle,
  Brain,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Database,
  CheckCircle2,
} from 'lucide-react';
import type { Explanation, Cause, Finding } from '../types';

interface ExplainerPageProps {
  explanation: Explanation | null;
  loading: boolean;
  onAskQuestion: (question: string) => Promise<void>;
  onInspectFindingById: (findingId: string) => void;
  onInspectEvidenceDirect: (finding: Finding) => void;
}

export const ExplainerPage: React.FC<ExplainerPageProps> = ({
  explanation,
  loading,
  onAskQuestion,
  onInspectFindingById,
}) => {
  const [customQuestion, setCustomQuestion] = useState(
    explanation?.question || 'Why did my margin drop in September?'
  );
  const [asking, setAsking] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customQuestion.trim()) return;
    setAsking(true);
    try {
      await onAskQuestion(customQuestion);
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header Banner */}
      <div className="glass-card rounded-3xl p-8 border border-slate-700/60 relative overflow-hidden shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="badge-indigo font-mono">
                <Brain className="w-3 h-3" />
                MARKOVIAN CAUSAL INFERENCE
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Model: NVIDIA Nemotron 3 Ultra 550B
              </span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
              Root-Cause Explainer
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-xl">
              Step-by-step causal investigation. The model never invents figures: every cited euro
              amount is bound to an audited row in Zetaris.
            </p>
          </div>

          {/* Uncertainty Protocol Badge */}
          {explanation && (
            <div className="bg-slate-925/90 p-5 rounded-2xl border border-slate-800 flex items-center gap-4">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  explanation.uncertain
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}
              >
                {explanation.uncertain ? (
                  <AlertCircle className="w-5 h-5" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
              </div>
              <div>
                <div className="text-xs font-mono text-slate-400">Data Grounding Status</div>
                <div className="text-sm font-semibold text-white mt-0.5">
                  {explanation.uncertain ? 'Uncertain (Data Gaps)' : '100% Mathematically Supported'}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Inquiry Box */}
      <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-4 border border-slate-800 flex gap-3">
        <div className="relative flex-1">
          <HelpCircle className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            placeholder="Ask the Explainer agent about your financial trends..."
            className="w-full pl-11 pr-4 py-2.5 bg-slate-900 border border-slate-700/80 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors font-medium"
          />
        </div>
        <button
          type="submit"
          disabled={asking || loading}
          className="px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm shadow-glow-violet transition-all duration-200 flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
        >
          {asking ? (
            <>
              <Brain className="w-4 h-4 animate-spin" />
              <span>Investigating...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Ask Agent</span>
            </>
          )}
        </button>
      </form>

      {/* Explanation Result */}
      {explanation && (
        <div className="space-y-6">
          {/* Executive Summary */}
          <div className="glass-card rounded-2xl p-6 border border-violet-500/30 bg-violet-950/10">
            <div className="text-xs font-mono uppercase tracking-wider text-violet-300 font-semibold mb-2 flex items-center gap-2">
              <Brain className="w-3.5 h-3.5" />
              Agent Executive Summary
            </div>
            <p className="text-base text-slate-100 font-medium leading-relaxed">
              {explanation.summary}
            </p>
          </div>

          {/* Ranked Causal Chain */}
          <div>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" />
              Ranked Causal Chain with Row Citations
            </h3>

            <div className="space-y-4">
              {explanation.causes.map((cause: Cause) => (
                <div
                  key={cause.rank}
                  className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-start gap-3.5">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/30 font-mono text-xs font-bold shrink-0 mt-0.5">
                      #{cause.rank}
                    </span>
                    <div>
                      <h4 className="text-base font-semibold text-white leading-snug">
                        {cause.cause}
                      </h4>
                      <div className="text-xs text-slate-400 mt-1 font-mono">
                        Direct Financial Impact: €{cause.amount_eur.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                    <span className="text-lg font-mono font-bold text-rose-400">
                      -€{cause.amount_eur.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>

                    {cause.finding_id && (
                      <button
                        onClick={() => onInspectFindingById(cause.finding_id!)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
                      >
                        <span>Evidence [{cause.finding_id}]</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
