import { createZetarisClient } from '../src/zetaris/client.ts';
import type { ChatOptions, Llm } from '../src/agents/types.ts';

const nope = () => Promise.reject(new Error('llm not available in this test'));
/** An Llm that always fails, like Nightshift being offline. */
export const fakeLlm: Llm = { chat: nope, generate: nope, listModels: nope };

/** P2's mock Zetaris views (backend/src/zetaris/mock) as ctx.sql. */
export const mockSql = createZetarisClient({ restUrl: 'http://unused', apiKey: '', orgId: '1', mock: true }).querySql;

/** An Llm whose chat() returns `reply` and records each call's options. */
export function scriptedLlm(reply: string | (() => string)) {
  const calls: (ChatOptions | undefined)[] = [];
  const llm: Llm = {
    async chat(_messages, opts) {
      calls.push(opts);
      return typeof reply === 'function' ? reply() : reply;
    },
    generate: async () => (typeof reply === 'function' ? reply() : reply),
    listModels: async () => [],
  };
  return { llm, calls };
}
