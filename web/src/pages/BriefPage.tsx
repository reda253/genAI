import React from 'react';
import {
  Wallet,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  TrendingDown,
  CheckCircle,
  FileSearch,
  ShieldAlert,
} from 'lucide-react';
import type { Brief, Move } from '../types';
import { MoveCard } from '../components/MoveCard';
import { GroundingStats } from '../components/GroundingStats';

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
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          Trigger your autonomous AI finance team to audit Zetaris views, detect unbilled work, and rank today's moves.
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
    <div className="space-y-8 animate-fade-in pb-16">
      
      {/* Hero Financial Banner */}
      <div className="glass-card rounded-3xl p-6 sm:p-8 border border-slate-800/80 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          {/* Top Meta Tag */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="badge-emerald font-mono">
                <Sparkles className="w-3 h-3" />
                DAILY BRIEF • {new Date(brief.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span className="text-xs text-slate-400 font-mono">ID: {brief.run_id}</span>
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Audit Scope: <span className="text-slate-300 font-semibold">Apr 01 – Sep 30, 2026</span>
            </div>
          </div>

          {/* Greeting & Subtitle */}
          <div className="max-w-2xl mb-6">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
              Good morning, Sara.
            </h1>
            <p className="text-slate-300 text-sm mt-1.5 leading-relaxed">
              Your autonomous AI agents audited 4 Zetaris data views overnight. Here is your current cash status,
              overnight anomalies, and your top 3 decisions for today.
            </p>
          </div>

          {/* Clean Metric Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-800/80">
            {/* Stat 1: Available Cash */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                  Available Cash Today
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white mt-1">
                  €{brief.cash_today.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Stat 2: Monthly Leaks Found */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                  Monthly Leak Recovery
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400 mt-1">
                  +€{totalPotentialRecovery.toLocaleString('en-US', { minimumFractionDigits: 2 })}/mo
                </div>
              </div>
            </div>

            {/* Stat 3: Decisions Pending */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  Actionable Decisions
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white mt-1">
                  {pendingCount} <span className="text-sm font-normal text-slate-400">pending ({approvedCount} approved)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Overnight Activity Callout ("What Changed") */}
          {brief.what_changed && brief.what_changed.length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-800/80">
              <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Overnight Financial Activity Detected
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {brief.what_changed.map((change, idx) => (
                  <div
                    key={idx}
                    className="px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs sm:text-sm text-slate-200 flex items-center gap-2.5 font-medium"
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <span>{change}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top 3 CFO Moves */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span>Top 3 Moves Ranked by CFO Agent</span>
              <span className="text-xs font-mono font-normal text-slate-400">
                (Money Impact & Urgency)
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Powered by Meterless H-MEM decision memory. Past decisions alter today's ranking.
            </p>
          </div>

          <button
            onClick={onNavigateToLeaks}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition-colors cursor-pointer group self-start sm:self-center"
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
      <div className="glass-card rounded-2xl p-4 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Strict Human-in-the-Loop: No invoices are sent and no subscriptions are cancelled without your approval.</span>
        </div>
        <div className="flex flex-col sm:items-end gap-1 shrink-0">
          <GroundingStats runId={brief.run_id} />
          <div className="font-mono text-slate-500 text-[11px]">
            NVIDIA Nemotron • Meterless Engines • Zetaris
          </div>
        </div>
      </div>
    </div>
  );
};
