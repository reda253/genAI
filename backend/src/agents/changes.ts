// I7: what changed since the previous run. Same matching key as evals/check_findings.py.
import type { Finding } from './types.ts';

export interface FindingChange { finding_id: string; field: 'monthly_impact_eur' | 'cash_at_risk_eur'; before: number; after: number }
export interface RunDiff { new: Finding[]; resolved: Finding[]; changed: FindingChange[] }

const FIELDS = ['monthly_impact_eur', 'cash_at_risk_eur'] as const;
const key = (f: Finding) => `${f.type}|${f.client_id ?? ''}|${f.subscription_id ?? ''}`;

export function diffRuns(prev: Finding[], cur: Finding[]): RunDiff {
  const before = new Map(prev.map(f => [key(f), f]));
  const now = new Set(cur.map(key));
  const changed: FindingChange[] = [];
  for (const f of cur) {
    const p = before.get(key(f));
    for (const field of FIELDS) {
      if (p && p[field] !== f[field]) changed.push({ finding_id: f.id, field, before: p[field], after: f[field] });
    }
  }
  return { new: cur.filter(f => !before.has(key(f))), resolved: prev.filter(f => !now.has(key(f))), changed };
}

const LABEL = { monthly_impact_eur: 'monthly impact', cash_at_risk_eur: 'cash at risk' } as const;

/** Plain lines for brief.what_changed: numbers come from the findings, never from a model. */
export function describeChanges(d: RunDiff, cur: Finding[]): string[] {
  const title = new Map(cur.map(f => [f.id, f.title]));
  return [
    ...d.new.map(f => `New: ${f.title}`),
    ...d.resolved.map(f => `Resolved: ${f.title}`),
    ...d.changed.map(c => `${title.get(c.finding_id)}: ${LABEL[c.field]} EUR ${c.before.toFixed(2)} → ${c.after.toFixed(2)}`),
  ];
}
