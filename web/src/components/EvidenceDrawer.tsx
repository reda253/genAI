import React, { useState, useEffect } from 'react';
import { X, Check, Copy, Database, Calendar, ShieldCheck, Terminal } from 'lucide-react';
import type { Evidence, Finding } from '../types';

interface EvidenceDrawerProps {
  finding: Finding | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({ finding, isOpen, onClose }) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !finding) return null;

  const handleCopySql = (sql: string, id: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-slate-900 border-l border-slate-700/60 shadow-2xl flex flex-col animate-slide-left z-10">
          {/* Header */}
          <div className="p-6 border-b border-slate-800 flex items-start justify-between bg-slate-925/80">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="badge-indigo text-[11px] font-mono tracking-wider">
                  FINDING {finding.id.toUpperCase()}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded font-medium ${
                    finding.confidence === 'high'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : finding.confidence === 'medium'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}
                >
                  <ShieldCheck className="w-3 h-3 inline mr-1" />
                  {finding.confidence.toUpperCase()} CONFIDENCE
                </span>
              </div>
              <h2 className="text-xl font-semibold text-white tracking-tight">{finding.title}</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              aria-label="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Money Impact Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/40">
                <div className="text-xs text-slate-400 font-medium">Monthly Money Leaked</div>
                <div className="text-2xl font-bold text-rose-400 mt-1 font-mono">
                  €{finding.monthly_impact_eur.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/40">
                <div className="text-xs text-slate-400 font-medium">Cash At Risk</div>
                <div className="text-2xl font-bold text-amber-400 mt-1 font-mono">
                  €{finding.cash_at_risk_eur.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Evidence items */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                <Database className="w-4 h-4 text-emerald-400" />
                <span>Audited Zetaris Semantic Layer Evidence ({finding.evidence.length})</span>
              </div>

              {finding.evidence.map((ev: Evidence) => (
                <div
                  key={ev.id}
                  className="rounded-xl border border-slate-700/60 bg-slate-925/70 overflow-hidden shadow-lg"
                >
                  {/* Evidence Header */}
                  <div className="px-4 py-3 bg-slate-800/60 border-b border-slate-700/50 flex items-center justify-between">
                    <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
                      <span className="text-emerald-400 font-bold">[{ev.id}]</span>
                      <span>view:</span>
                      <span className="text-brand-300 px-1.5 py-0.5 rounded bg-brand-950/80 border border-brand-800/50">
                        {ev.view}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{new Date(ev.ran_at).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* SQL Query */}
                  <div className="p-4 bg-slate-950/90 border-b border-slate-800/80">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                        Executed SQL Query (SELECT-only)
                      </span>
                      <button
                        onClick={() => handleCopySql(ev.sql, ev.id)}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-400 font-mono transition-colors cursor-pointer px-2 py-1 rounded hover:bg-slate-800"
                      >
                        {copiedId === ev.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy SQL</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="text-xs font-mono text-slate-200 overflow-x-auto p-3 rounded-lg bg-slate-900 border border-slate-800 text-cyan-200/90 whitespace-pre-wrap leading-relaxed">
                      {ev.sql}
                    </pre>
                  </div>

                  {/* Evidence Table */}
                  <div className="p-4 bg-slate-900/50">
                    <div className="text-xs font-mono text-slate-400 mb-2 font-medium">
                      Returned Rows ({ev.rows.length}):
                    </div>
                    {ev.rows.length === 0 ? (
                      <div className="text-xs text-slate-500 italic">No rows returned</div>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-slate-800">
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-slate-800/80 text-slate-300 uppercase tracking-wider text-[11px]">
                            <tr>
                              {Object.keys(ev.rows[0]).map((col) => (
                                <th key={col} className="px-3 py-2 border-b border-slate-700/60 font-semibold">
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                            {ev.rows.map((row, rowIdx) => (
                              <tr key={rowIdx} className="hover:bg-slate-800/30 transition-colors">
                                {Object.values(row).map((val, cellIdx) => (
                                  <td key={cellIdx} className="px-3 py-2 text-slate-300 whitespace-nowrap">
                                    {typeof val === 'number'
                                      ? val.toLocaleString('en-US', { maximumFractionDigits: 2 })
                                      : String(val ?? 'NULL')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-800 bg-slate-925/80 flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono">Audit Trail: Every number is mathematically cited.</span>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors cursor-pointer font-medium"
            >
              Done Reviewing
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
