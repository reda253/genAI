// H-MEM adapter for Ledger Lens — stores user decisions (approve/reject)
// and injects memory context to influence CFO move ranking.
import type { HMEM, MemoryRecord, QueryResult } from './hmem/index.ts';
import type { Move } from '../agents/types.ts';

export interface DecisionRecord {
  moveId: string;
  actionType: string;
  decision: 'approve' | 'reject';
  title: string;
  note: string | null;
  memoryId: string;
}

export type DecisionMemory = MemoryRecord & {
  category: string;
  text: string;
};

export function recordDecision(
  hmem: HMEM,
  move: Move,
  decision: 'approve' | 'reject',
  note: string | null = null,
): DecisionMemory {
  const isApprove = decision === 'approve';
  const text = `User ${isApprove ? 'APPROVED' : 'REJECTED'} action "${move.title}" (${move.action_type})${note ? ` with note: "${note}"` : ''}. Original reason: "${move.reason}".`;

  const memory = hmem.add({
    type: 'preference',
    content: text,
    source: 'user_decision',
    confidence: isApprove ? 0.85 : 0.95, // rejections are especially important to remember
    tags: ['decision', move.action_type, decision],
  });

  return Object.assign(memory, {
    category: memory.type,
    text: memory.content,
  });
}

export function retrieveMemoriesForMove(
  hmem: HMEM,
  move: Move,
): QueryResult {
  const query = `${move.action_type} ${move.title} ${move.reason}`;
  return hmem.query(query, { topN: 3, threshold: 0.1 });
}

export function applyMemoriesToMoves(
  hmem: HMEM,
  moves: Move[],
): Move[] {
  const updatedMoves = moves.map(m => ({ ...m }));
  // Sort weight only: monthly_impact_eur is money from the findings and is shown to the user, never scaled.
  const score = new Map(updatedMoves.map(m => [m.id, m.monthly_impact_eur]));
  let hasAnyMemory = false;

  for (const move of updatedMoves) {
    const query = `${move.action_type} ${move.title}`;
    // Only decisions about the same kind of action apply (recordDecision tags each memory with its action_type);
    // similarity alone matched every move to any decision.
    const matches = hmem.query(query, { topN: 5, threshold: 0.05 }).memories
      .filter(r => r.memory.tags?.includes('decision') && r.memory.tags.includes(move.action_type));

    if (matches.length > 0) {
      hasAnyMemory = true;
      const best = matches[0].memory;
      const text = (best.content || '').toLowerCase();

      if (text.includes('rejected')) {
        // User previously rejected this or similar move
        move.memory_note = `You previously rejected a similar recommendation ("${best.content.slice(0, 80)}..."). Adjusted accordingly.`;
        // Lower urgency
        if (move.urgency === 'high') move.urgency = 'medium';
        else if (move.urgency === 'medium') move.urgency = 'low';
        // Reduce effective impact score for sorting
        score.set(move.id, move.monthly_impact_eur * 0.5);
      } else if (text.includes('approved')) {
        // User approved before
        move.memory_note = `You previously approved a similar recommendation ("${best.content.slice(0, 80)}..."). Prioritized.`;
        // Boost effective impact score for sorting
        score.set(move.id, move.monthly_impact_eur * 1.5);
      }
    }
  }

  if (!hasAnyMemory) {
    return updatedMoves;
  }

  // Sort by urgency ('high' > 'medium' > 'low') then monthly_impact_eur descending
  const urgencyWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
  updatedMoves.sort((a, b) => {
    const uDiff = (urgencyWeight[b.urgency] ?? 0) - (urgencyWeight[a.urgency] ?? 0);
    if (uDiff !== 0) return uDiff;
    return score.get(b.id)! - score.get(a.id)!;
  });

  // Re-assign ranks 1..N
  return updatedMoves.map((m, idx) => ({ ...m, rank: idx + 1 }));
}
