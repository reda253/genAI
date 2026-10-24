import React, { useState } from 'react';
import {
  Search,
  Filter,
  TrendingDown,
  ShieldAlert,
  Database,
  ArrowUpDown,
} from 'lucide-react';
import type { Finding, LeakType } from '../types';
import { FindingCard } from '../components/FindingCard';

interface LeaksPageProps {
  findings: Finding[];
  loading: boolean;
  onInspectFinding: (finding: Finding) => void;
}

export const LeaksPage: React.FC<LeaksPageProps> = ({
  findings,
  loading,
  onInspectFinding,
}) => {
  const [filterType, setFilterType] = useState<LeakType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'impact' | 'cash_risk'>('impact');

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-28 rounded-3xl bg-slate-900/60 border border-slate-800" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-2xl bg-slate-900/60 border border-slate-800" />
          ))}
        </div>
      </div>
    );
  }

  const filteredFindings = findings
    .filter((f) => (filterType === 'all' ? true : f.type === filterType))
    .filter((f) =>
      searchQuery
        ? f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.id.toLowerCase().includes(searchQuery.toLowerCase())
        : true
    )
    .sort((a, b) => {
      if (sortBy === 'impact') {
        return b.monthly_impact_eur - a.monthly_impact_eur;
      }
      return b.cash_at_risk_eur - a.cash_at_risk_eur;
    });

  const totalMonthlyImpact = findings.reduce((acc, f) => acc + (f.monthly_impact_eur || 0), 0);
  const totalCashAtRisk = findings.reduce((acc, f) => acc + (f.cash_at_risk_eur || 0), 0);

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header Banner */}
      <div className="glass-card rounded-3xl p-8 border border-slate-700/60 relative overflow-hidden shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="badge-rose font-mono">
                <ShieldAlert className="w-3 h-3" />
                AUDITED ANOMALIES
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {findings.length} Planted Leaks Detected
              </span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
              Where Your Money Leaks
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-xl">
              Every finding was discovered through fixed SQL audits over 4 Zetaris views. Click on any
              card to inspect the raw query and database rows behind it.
            </p>
          </div>

          {/* Cumulative Leaks Overview */}
          <div className="flex items-center gap-6 bg-slate-925/90 p-5 rounded-2xl border border-slate-800">
            <div>
              <div className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                Total Monthly Leak
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-rose-400 mt-1">
                -€{totalMonthlyImpact.toLocaleString('en-US', { minimumFractionDigits: 2 })}/mo
              </div>
            </div>

            <div className="h-12 w-px bg-slate-800" />

            <div>
              <div className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-amber-400" />
                Total Cash At Risk
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono text-amber-400 mt-1">
                €{totalCashAtRisk.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0 text-xs font-medium">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
              filterType === 'all'
                ? 'bg-emerald-600 text-white font-semibold'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            All Leaks ({findings.length})
          </button>
          <button
            onClick={() => setFilterType('late_payer')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
              filterType === 'late_payer'
                ? 'bg-amber-600 text-white font-semibold'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Late Payers
          </button>
          <button
            onClick={() => setFilterType('unbilled_hours')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
              filterType === 'unbilled_hours'
                ? 'bg-rose-600 text-white font-semibold'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Unbilled Hours
          </button>
          <button
            onClick={() => setFilterType('price_rise')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
              filterType === 'price_rise'
                ? 'bg-purple-600 text-white font-semibold'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Price Rises
          </button>
          <button
            onClick={() => setFilterType('unused_subscription')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
              filterType === 'unused_subscription'
                ? 'bg-cyan-600 text-white font-semibold'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Unused SaaS
          </button>
          <button
            onClick={() => setFilterType('underpriced_service')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${
              filterType === 'underpriced_service'
                ? 'bg-emerald-600 text-white font-semibold'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            Underpriced
          </button>
        </div>

        {/* Search & Sort Controls */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search findings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <button
            onClick={() => setSortBy(sortBy === 'impact' ? 'cash_risk' : 'impact')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sort: {sortBy === 'impact' ? 'Monthly Impact' : 'Cash Risk'}</span>
          </button>
        </div>
      </div>

      {/* Grid of Finding Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredFindings.map((finding) => (
          <FindingCard
            key={finding.id}
            finding={finding}
            onInspect={onInspectFinding}
          />
        ))}
      </div>

      {filteredFindings.length === 0 && (
        <div className="glass-card rounded-2xl p-12 text-center text-slate-400">
          <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No findings match your filter.</p>
        </div>
      )}
    </div>
  );
};
