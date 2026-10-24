import React from 'react';
import {
  Wallet,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  TrendingDown,
  CheckCircle,
  FileSearch,
} from 'lucide-react';
import type { Brief, Move } from '../types';
import { MoveCard } from '../components/MoveCard';

interface BriefPageProps {
  brief: Brief | null;
  loading: boolean;
  onDecideMove: (id: string, decision: 'approve' | 'reject') => Promise<void>;
  onInspectFinding: (findingId: string) => void;
  onNavigateToLeaks: () => void;
  onTriggerRun: () => void;
}

export const BriefPage: React.FC<BriefPageProps> = ({
  brief,
  loading,
  onDecideMove,
  onInspectFinding,
  onNavigateToLeaks,
  onTriggerRun,
}) => {
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-44 rounded-3xl bg-slate-900/60 border border-slate-800" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-64 rounded-2xl bg-slate-900/60 border border-slate-800" />
          <div className="h-64 rounded-2xl bg-slate-900/60 border border-slate-800" />
          <div className="h-64 rounded-2xl bg-slate-900/60 border border-slate-800" />
        </div>
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="glass-card rounded-3xl p-12 text-center max-w-xl mx-auto my-12 border border-slate-800">
        <FileSearch className="w-12 h-12 text-slate-500 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">No Analysis Run Yet</h3>
        <p className="text-sm text-slate-400 mb-6">
          Trigger your AI finance team to scan Zetaris views, detect leaks, and rank morning actions.
        </p>
        <button
          onClick={onTriggerRun}
          className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl shadow-glow-emerald cursor-pointer transition-all"
        >
          Run First Autonomous Analysis
        </button>
      </div>
    );
  }

  const approvedCount = brief.moves.filter((m: Move) => m.status === 'approved').length;
  const pendingCount = brief.moves.filter((m: Move) => m.status === 'pending').length;
  const totalPotentialRecovery = brief.moves.reduce((acc: number, m: Move) => acc + (m.monthly_impact_eur || 0), 0);

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Hero Financial Banner */}
      <div className="glass-card rounded-3xl p-8 border border-slate-700/60 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="badge-emerald font-mono">
                <Sparkles className="w-3 h-3" />
                MORNING BRIEF • {new Date(brief.generated_at).toLocaleDateString()}
              </span>
              <span className="text-xs text-slate-400 font-mono">Run: {brief.run_id}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
              Good morning, Sara.
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-xl">
              Your autonomous agents completed their audit. Here is your cash position, what changed
              overnight, and your top 3 decisions for today.
            </p>
          </div>

          {/* Big Balance & Recovery Stat */}
          <div className="flex items-center gap-4 sm:gap-6 bg-slate-925/90 p-5 rounded-2xl border border-slate-800 shadow-inner">
            <div>
              <div className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                Available Cash Today
              </div>
              <div className="text-3xl sm:text-4xl font-extrabold font-mono text-white mt-1">
                €{brief.cash_today.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="h-12 w-px bg-slate-800" />

            <div>
              <div className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                Monthly Leak Detected
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-rose-400 mt-1">
                +€{totalPotentialRecovery.toLocaleString('en-US', { minimumFractionDigits: 2 })}/mo
              </div>
            </div>
          </div>
        </div>

        {/* Overnight Activity Callout ("What Changed") */}
        {brief.what_changed && brief.what_changed.length > 0 && (
          <div className="mt-6 pt-6 border-t border-slate-800/80">
            <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              What Changed in Your Finances
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {brief.what_changed.map((change, idx) => (
                <div
                  key={idx}
                  className="px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800/90 text-sm text-slate-200 flex items-center gap-2.5 font-medium"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <span>{change}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Top 3 CFO Moves */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>Top 3 Moves Ranked by Money Impact & Urgency</span>
              <span className="text-xs font-mono font-normal text-slate-400">
                ({approvedCount} approved, {pendingCount} pending)
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              CFO Agent prioritized these using past approval memory (Meterless H-MEM). Nothing happens without your signature.
            </p>
          </div>

          <button
            onClick={onNavigateToLeaks}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition-colors cursor-pointer group"
          >
            <span>View All {brief.findings_count} Leaks</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {brief.moves.map((move: Move) => (
            <MoveCard
              key={move.id}
              move={move}
              onDecide={onDecideMove}
              onInspectFinding={onInspectFinding}
            />
          ))}
        </div>
      </section>

      {/* Human-in-the-Loop Trust Footer */}
      <div className="glass-card rounded-2xl p-4 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>Strict Human-in-the-Loop Architecture: Emails, cancellations, and invoices require explicit approval.</span>
        </div>
        <div className="font-mono text-slate-500">
          Powered by Meterless H-MEM & NVIDIA Nemotron
        </div>
      </div>
    </div>
  );
};
