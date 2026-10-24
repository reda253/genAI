import React from 'react';
import {
  Clock,
  Hourglass,
  TrendingUp,
  Ghost,
  Coins,
  Copy,
  ChevronRight,
  ShieldCheck,
  Database,
} from 'lucide-react';
import type { Finding, LeakType } from '../types';

interface FindingCardProps {
  finding: Finding;
  onInspect: (finding: Finding) => void;
}

const getLeakMeta = (type: LeakType) => {
  switch (type) {
    case 'late_payer':
      return {
        label: 'Late Payer',
        icon: <Clock className="w-4 h-4 text-amber-400" />,
        badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      };
    case 'unbilled_hours':
      return {
        label: 'Unbilled Hours',
        icon: <Hourglass className="w-4 h-4 text-rose-400" />,
        badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      };
    case 'price_rise':
      return {
        label: 'Silent Price Rise',
        icon: <TrendingUp className="w-4 h-4 text-purple-400" />,
        badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      };
    case 'unused_subscription':
      return {
        label: 'Unused Subscription',
        icon: <Ghost className="w-4 h-4 text-cyan-400" />,
        badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      };
    case 'underpriced_service':
      return {
        label: 'Underpriced Service',
        icon: <Coins className="w-4 h-4 text-emerald-400" />,
        badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      };
    case 'duplicate_charge':
      return {
        label: 'Duplicate Charge',
        icon: <Copy className="w-4 h-4 text-pink-400" />,
        badgeClass: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
      };
  }
};

export const FindingCard: React.FC<FindingCardProps> = ({ finding, onInspect }) => {
  const meta = getLeakMeta(finding.type);

  return (
    <div
      onClick={() => onInspect(finding)}
      className="glass-card glass-card-hover rounded-2xl p-5 cursor-pointer flex flex-col justify-between group"
    >
      <div>
        {/* Header Tags */}
        <div className="flex items-center justify-between mb-3">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${meta.badgeClass}`}>
            {meta.icon}
            {meta.label}
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`text-[11px] px-2 py-0.5 rounded font-mono font-medium ${
                finding.confidence === 'high'
                  ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                  : 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
              }`}
            >
              <ShieldCheck className="w-3 h-3 inline mr-1" />
              {finding.confidence.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Title */}
        <h4 className="text-base font-semibold text-white group-hover:text-emerald-300 transition-colors leading-snug mb-3">
          {finding.title}
        </h4>
      </div>

      {/* Money Metrics & Footer */}
      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between mt-2">
        <div>
          {finding.monthly_impact_eur > 0 ? (
            <div>
              <span className="text-[11px] text-slate-400 block font-mono">Monthly Leak</span>
              <span className="text-base font-bold font-mono text-rose-400">
                -€{finding.monthly_impact_eur.toLocaleString('en-US', { minimumFractionDigits: 2 })}/mo
              </span>
            </div>
          ) : (
            <div>
              <span className="text-[11px] text-slate-400 block font-mono">Cash At Risk</span>
              <span className="text-base font-bold font-mono text-amber-400">
                €{finding.cash_at_risk_eur.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-xs font-medium text-emerald-400 group-hover:translate-x-1 transition-transform">
          <Database className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400 text-xs">({finding.evidence.length})</span>
          <span className="ml-1">Evidence</span>
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
};
