import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  CreditCard,
  TrendingDown,
  FileText,
  Loader2,
  ShieldAlert,
  ArrowRight,
  Database,
} from 'lucide-react';
import { api } from '../api';
import type { Entity, Finding } from '../types';

interface EntityDrawerProps {
  entityId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onInspectFinding?: (findingId: string) => void;
  onSimulateLoss?: (clientId: string) => void;
}

export const EntityDrawer: React.FC<EntityDrawerProps> = ({
  entityId,
  isOpen,
  onClose,
  onInspectFinding,
  onSimulateLoss,
}) => {
  const [entity, setEntity] = useState<Entity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && entityId) {
      setLoading(true);
      setError(null);
      api
        .getEntity(entityId)
        .then((res) => setEntity(res))
        .catch((err) => setError(err.message || 'Failed to retrieve entity data'))
        .finally(() => setLoading(false));
    } else {
      setEntity(null);
    }
  }, [isOpen, entityId]);

  if (!isOpen || !entityId) return null;

  const isClient = entity?.kind === 'client' || entityId.startsWith('c');

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-slate-900 border-l border-slate-700/70 shadow-2xl flex flex-col animate-slide-left z-10">
          
          {/* Header */}
          <div className="p-6 border-b border-slate-800 flex items-start justify-between bg-slate-925/90">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="badge-indigo font-mono text-[11px]">
                  WORLD MODEL 360
                </span>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold border flex items-center gap-1.5 ${
                    isClient
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                      : 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                  }`}
                >
                  {isClient ? (
                    <Building2 className="w-3.5 h-3.5" />
                  ) : (
                    <CreditCard className="w-3.5 h-3.5" />
                  )}
                  {isClient ? 'CLIENT PROFILE' : 'SUBSCRIPTION VENDOR'}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  KEY: {entityId}
                </span>
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">
                {entity?.name ?? entityId}
              </h2>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              aria-label="Close drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {loading && (
              <div className="py-20 text-center space-y-3">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
                <p className="text-xs font-mono text-slate-400">
                  Querying Meterless World Model entity knowledge graph...
                </p>
              </div>
            )}

            {error && (
              <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs">
                {error}
              </div>
            )}

            {entity && !loading && (
              <>
                {/* AI Executive Context Summary */}
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-emerald-400" />
                    World Model Context Summary
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    {entity.summary}
                  </p>
                </div>

                {/* Key Facts Grid */}
                <div className="space-y-2.5">
                  <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
                    Zetaris Verified Facts & Attributes
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {Object.entries(entity.facts).map(([key, value]) => (
                      <div
                        key={key}
                        className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80"
                      >
                        <div className="text-[11px] font-mono text-slate-400 truncate">
                          {key.replace(/_/g, ' ')}
                        </div>
                        <div className="text-sm font-semibold font-mono text-white mt-1 truncate">
                          {typeof value === 'number' && key.includes('rate')
                            ? `€${value}/h`
                            : typeof value === 'number' && key.includes('cost')
                            ? `€${value}/mo`
                            : String(value)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Active Leak Findings for this Entity */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                      Associated Financial Anomaly Findings ({entity.findings.length})
                    </div>
                  </div>

                  {entity.findings.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/60 text-xs text-slate-400 italic">
                      No active leak findings associated with this entity.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {entity.findings.map((f: Finding) => (
                        <div
                          key={f.id}
                          className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="badge-rose text-[10px] font-mono">
                                {f.id.toUpperCase()}
                              </span>
                              <span className="text-xs font-semibold text-white">
                                {f.title}
                              </span>
                            </div>
                            <div className="text-xs font-mono text-slate-400">
                              {f.monthly_impact_eur > 0
                                ? `Monthly Leak: €${f.monthly_impact_eur.toFixed(2)}/mo`
                                : `Cash At Risk: €${f.cash_at_risk_eur.toFixed(2)}`}
                            </div>
                          </div>

                          {onInspectFinding && (
                            <button
                              onClick={() => {
                                onInspectFinding(f.id);
                                onClose();
                              }}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                            >
                              <span>Inspect Evidence</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Past Invoices / Activity Table */}
                {entity.invoices && entity.invoices.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-cyan-400" />
                      Audited Invoices & Records ({entity.invoices.length})
                    </div>

                    <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-900/90 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                          <tr>
                            <th className="px-3.5 py-2.5">Record ID</th>
                            <th className="px-3.5 py-2.5">Amount</th>
                            <th className="px-3.5 py-2.5">Status / Timing</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850">
                          {entity.invoices.map((inv: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-900/50">
                              <td className="px-3.5 py-2.5 font-mono text-slate-300">
                                {inv.invoice_id || `rec_${idx + 1}`}
                              </td>
                              <td className="px-3.5 py-2.5 font-mono font-semibold text-white">
                                {inv.amount ? `€${Number(inv.amount).toFixed(2)}` : '—'}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <span
                                  className={`px-2 py-0.5 rounded font-mono text-[10px] font-semibold ${
                                    inv.status === 'overdue'
                                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                      : inv.status === 'duplicate_paid'
                                      ? 'bg-pink-500/10 text-pink-400 border border-pink-500/20'
                                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  }`}
                                >
                                  {inv.status || 'Active'}{' '}
                                  {inv.days_late ? `(${inv.days_late}d late)` : ''}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer Action: What-If Simulation Shortcut */}
          <div className="p-5 border-t border-slate-800 bg-slate-925/90 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-400 font-mono">
              World Model • Ingested via Zetaris
            </div>

            <div className="flex items-center gap-3">
              {isClient && onSimulateLoss && (
                <button
                  onClick={() => {
                    onSimulateLoss(entityId);
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold shadow-glow-cyan flex items-center gap-2 cursor-pointer transition-all active:scale-[0.98]"
                  title="Simulate the financial impact of losing this client on cash runway"
                >
                  <TrendingDown className="w-3.5 h-3.5" />
                  <span>Simulate Losing {entity?.name ?? entityId}</span>
                </button>
              )}

              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
