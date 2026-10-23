import { findings, baselineForecast, briefFor } from '../src/agents/fixtures.ts';

test('one finding per leak type, all with evidence', () => {
  expect(new Set(findings.map(f => f.type)).size).toBe(6);
  findings.forEach(f => expect(f.evidence.length).toBeGreaterThan(0));
});

test('brief has exactly 3 ranked moves that cite real findings', () => {
  const b = briefFor('run_20261001_080000', '2026-10-01T08:00:30Z');
  expect(b.moves.map(m => m.rank)).toEqual([1, 2, 3]);
  const ids = new Set(findings.map(f => f.id));
  b.moves.forEach(m => m.finding_ids.forEach(id => expect(ids.has(id)).toBe(true)));
  expect(b.findings_count).toBe(6);
});

test('baseline forecast covers Oct 2026 to Mar 2027', () => {
  expect(baselineForecast.months.map(m => m.month)).toEqual(
    ['2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01']);
});

test('briefFor returns independent move copies', () => {
  const a = briefFor('run_a', '2026-10-01T08:00:00Z');
  a.moves[0].status = 'approved';
  expect(briefFor('run_b', '2026-10-01T08:00:00Z').moves[0].status).toBe('pending');
});
