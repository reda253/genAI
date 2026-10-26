// Meterless engines factory — wire all three engines to one injected Llm.
// P4 owns this file. Called once from server.ts and injected into orchestrator.
import type { Llm } from '../agents/types.ts';
import { WorldModel } from './world-model/index.ts';
import { HMEM } from './hmem/index.ts';
import { Markovian } from './markovian/index.ts';

export { WorldModel } from './world-model/index.ts';
export { HMEM } from './hmem/index.ts';
export { Markovian } from './markovian/index.ts';
export * from './worldModelAdapter.ts';
export * from './hmemAdapter.ts';
export * from './markovianAdapter.ts';

export interface Engines {
  worldModel: WorldModel;
  hmem: HMEM;
  markovian: Markovian;
}

export interface CreateEnginesOptions {
  persistDir?: string;
}

export function createEngines(llm?: Partial<Llm>, opts?: CreateEnginesOptions): Engines {
  // Each engine takes an injected generator — one Nightshift call, swappable in one line.
  const generate = (prompt: string) => (llm?.generate ? llm.generate(prompt) : Promise.resolve('{}'));

  const worldModel = new WorldModel({
    namespace: 'ledger-lens',
    storage: 'memory',
  });

  const hmem = new HMEM({
    persistDir: opts?.persistDir,
    minerFn: async (prompt: string) => {
      try {
        return await generate(prompt);
      } catch {
        return '[]';
      }
    },
  });

  const markovian = new Markovian({
    chunkConfig: {
      chunkSize: 4000,
      maxChunks: 5,
      carryoverTokens: 400,
    },
    compressorFn: async (prompt: string) => generate(prompt),
    generator: async (prompt: string) => ({ text: await generate(prompt) }),
  });

  return { worldModel, hmem, markovian };
}
