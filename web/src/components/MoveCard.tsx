import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  AlertTriangle,
  Sparkles,
  Brain,
  FileText,
  CreditCard,
  Ban,
  TrendingUp,
} from 'lucide-react';
import type { Move, ActionType, Urgency } from '../types';

interface MoveCardProps {
  move: Move;
  onDecide: (id: string, decision: 'approve' | 'reject') => Promise<void>;
  onInspectFinding?: (findingId: string) => void;
}

const getActionIcon = (type: ActionType) => {
  switch (type) {
    case 'bill_hours':
      return <Clock className="w-4 h-4 text-emerald-400" />;
    case 'send_reminder':
      return <Send className="w-4 h-4 text-amber-400" />;
    case 'cancel_subscription':
      return <Ban className="w-4 h-4 text-rose-400" />;
    case 'dispute_charge':
      return <CreditCard className="w-4 h-4 text-purple-400" />;
    case 'raise_rate':
      return <TrendingUp className="w-4 h-4 text-cyan-400" />;
  }
};

const getActionLabel = (type: ActionType) => {
  switch (type) {
    case 'bill_hours':
      return 'Bill Hours';
    case 'send_reminder':
      return 'Payment Reminder';
    case 'cancel_subscription':
      return 'Cancel SaaS';
    case 'dispute_charge':
      return 'Dispute Charge';
    case 'raise_rate':
      return 'Rate Adjustment';
  }
};

const getUrgencyBadge = (urgency: Urgency) => {
  switch (urgency) {
    case 'high':
      return (
        <span className="badge-rose animate-pulse-subtle">
          <AlertTriangle className="w-3 h-3" />
          HIGH URGENCY
        </span>
      );
    case 'medium':
      return (
        <span className="badge-amber">
          <Clock className="w-3 h-3" />
          MEDIUM
        </span>
      );
    case 'low':
      return (
        <span className="badge-emerald">
          <CheckCircle2 className="w-3 h-3" />
          LOW
        </span>
      );
  }
};

export const MoveCard: React.FC<MoveCardProps> = ({ move, onDecide, onInspectFinding }) => {
  const [loadingDecision, setLoadingDecision] = useState<'approve' | 'reject' | null>(null);

  const handleAction = async (decision: 'approve' | 'reject') => {
    setLoadingDecision(decision);
    try {
      await onDecide(move.id, decision);
    } finally {
      setLoadingDecision(null);
    }
  };

  const isResolved = move.status === 'approved' || move.status === 'rejected';

  return (
    <div
      className={`glass-card rounded-2xl p-6 transition-all duration-300 relative overflow-hidden ${
        move.status === 'approved'
          ? 'border-emerald-500/40 bg-emerald-950/20'
          : move.status === 'rejected'
          ? 'border-slate-800 bg-slate-950/40 opacity-70'
          : move.urgency === 'high'
          ? 'hover:border-rose-500/40 hover:shadow-glow-rose'
          : 'hover:border-brand-500/40'
      }`}
    >
      {/* Top Meta Line */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-slate-300">
            #{move.rank}
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800/80 border border-slate-700/60 text-slate-300">
            {getActionIcon(move.action_type)}
            {getActionLabel(move.action_type)}
          </span>
          {getUrgencyBadge(move.urgency)}
        </div>

        {/* Status Indicator */}
        {move.status === 'approved' && (
          <span className="badge-emerald font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            APPROVED BY SARA
          </span>
        )}
        {move.status === 'rejected' && (
          <span className="badge-rose font-semibold">
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            REJECTED
          </span>
        )}
      </div>

      {/* Main Title & Money Impact */}
      <div className="flex items-start justify-between gap-4 my-2">
        <h3 className="text-lg font-semibold text-white tracking-tight leading-snug">{move.title}</h3>
        {move.monthly_impact_eur > 0 && (
          <div className="text-right shrink-0">
            <span className="text-xs text-slate-400 font-mono block">Estimated Impact</span>
            <span className="text-lg font-bold font-mono text-emerald-400">
              +€{move.monthly_impact_eur.toLocaleString('en-US', { minimumFractionDigits: 2 })}/mo
            </span>
          </div>
        )}
      </div>

      {/* Reason */}
      <p className="text-sm text-slate-300/90 leading-relaxed mb-4">{move.reason}</p>

      {/* Memory Moment (H-MEM Callout) */}
      {move.memory_note && (
        <div className="mb-4 p-3 rounded-xl bg-violet-950/40 border border-violet-500/30 flex items-start gap-2.5 animate-fade-in">
          <Brain className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
          <div className="text-xs text-violet-200/90 leading-relaxed">
            <span className="font-semibold text-violet-300">H-MEM Agent Memory: </span>
            {move.memory_note}
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
        {/* Linked Finding button */}
        {move.finding_ids && move.finding_ids.length > 0 && onInspectFinding ? (
          <button
            onClick={() => onInspectFinding(move.finding_ids[0])}
            className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 font-medium transition-colors cursor-pointer group"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>View Root Evidence ({move.finding_ids[0]})</span>
          </button>
        ) : (
          <div />
        )}

        {/* Approve / Reject Buttons */}
        <div className="flex items-center gap-2">
          {!isResolved ? (
            <>
              <button
                disabled={loadingDecision !== null}
                onClick={() => handleAction('reject')}
                className="px-3.5 py-1.5 rounded-lg border border-slate-700 hover:border-rose-500/50 hover:bg-rose-500/10 text-slate-300 hover:text-rose-400 text-xs font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
              >
                {loadingDecision === 'reject' ? 'Rejecting...' : 'Reject'}
              </button>
              <button
                disabled={loadingDecision !== null}
                onClick={() => handleAction('approve')}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-glow-emerald transition-all duration-150 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {loadingDecision === 'approve' ? 'Approving...' : 'Approve Move'}
              </button>
            </>
          ) : (
            <span className="text-xs text-slate-500 font-mono italic">Decision recorded in H-MEM engine</span>
          )}
        </div>
      </div>
    </div>
  );
};
