// Meterless Nightshift provider (OpenAI-compatible runtime). Contract: Setup Guide §4.5.
import type { Config } from '../config.ts';
import type { ChatMessage, ChatOptions, Llm } from '../agents/types.ts';

export class NightshiftError extends Error {
  constructor(message: string, public status: number | null) {
    super(message);
    this.name = 'NightshiftError';
  }
}

/** Nemotron reasoning models may prefix content with "...</think>"; keep only the answer. */
export function stripReasoning(content: string): string {
  const end = content.lastIndexOf('</think>');
  return (end === -1 ? content : content.slice(end + '</think>'.length)).trim();
}

export function createNightshift(cfg: Config['meterless'], fetchImpl: typeof fetch = fetch): Llm {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const headers = {
    authorization: `Bearer ${cfg.token}`,
    'content-type': 'application/json',
    'meterless-app': 'ledger-lens',
    'meterless-scope': 'user',
  };

  async function call(path: string, init: RequestInit, timeoutMs: number): Promise<any> {
    let res: Response;
    try {
      res = await fetchImpl(base + path, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      throw new NightshiftError(`Nightshift unreachable at ${base}: ${(e as Error).message}`, null);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new NightshiftError(`Nightshift ${res.status}: ${body?.error?.message ?? res.statusText}`, res.status);
    return body;
  }

  const llm: Llm = {
    async chat(messages: ChatMessage[], opts: ChatOptions = {}) {
      const body = await call('/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: opts.model ?? cfg.model,
          messages,
          max_tokens: opts.maxTokens ?? 2000, // reasoning eats ~200+ tokens before the answer
          temperature: opts.temperature ?? 0,
        }),
      }, 120_000);
      const content = stripReasoning(body?.choices?.[0]?.message?.content ?? '');
      if (!content) throw new NightshiftError('Nightshift returned an empty reply (raise maxTokens?)', 200);
      return content;
    },
    generate: prompt => llm.chat([{ role: 'user', content: prompt }]),
    async listModels() {
      const body = await call('/models', { method: 'GET' }, 10_000);
      return (body?.data ?? []).map((m: { id: string }) => m.id);
    },
  };
  return llm;
}
