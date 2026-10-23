// STUB (P5 replaces): fixed SQL checks over Zetaris views, model ranks and describes.
import type { AgentContext, Finding } from './types.ts';
import { findings } from './fixtures.ts';

export async function leakHunter(_ctx: AgentContext): Promise<Finding[]> {
  return structuredClone(findings);
}
