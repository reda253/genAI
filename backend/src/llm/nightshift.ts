// Meterless Runtime provider (OpenAI-compatible). Contract: POWER "Add Meterless as a provider",
// Meterless Runtime 1.4, provider contract v4.
import type { Config } from '../config.ts';
import type { ChatMessage, ChatOptions, Llm } from '../agents/types.ts';

export type RuntimeStatus = 'online' | 'unauthorized' | 'offline';

export class NightshiftError extends Error {
  constructor(message: string, public status: number | null) {
    super(message);
    this.name = 'NightshiftError';
  }
}

const CHAT_TIMEOUT_MS = 180_000; // a model load can take minutes
const PLACEHOLDER_TOKEN = 'rt-local';

/** Any pasted runtime URL → <scheme>://<host>/v1 (never /v1/v1). */
export function normalizeBaseUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
  url = url.replace(/\/+$/, '').replace(/\/(chat\/completions|models|healthz)$/, '');
  while (/\/v1$/.test(url)) url = url.slice(0, -3);
  return url.replace(/\/+$/, '') + '/v1';
}

/** http://<host>:<port>/connect#k=<key> → { baseUrl, token }; anything else → null. */
export function parseConnectLink(link: string): { baseUrl: string; token: string } | null {
  try {
    const u = new URL(link);
    const token = new URLSearchParams(u.hash.slice(1)).get('k');
    if (u.pathname.replace(/\/+$/, '') !== '/connect' || !token) return null;
    return { baseUrl: u.origin + '/v1', token };
  } catch {
    return null;
  }
}

/** Nemotron reasoning models may prefix content with "...</think>"; keep only the answer. */
export function stripReasoning(content: string): string {
  const end = content.lastIndexOf('</think>');
  return (end === -1 ? content : content.slice(end + '</think>'.length)).trim();
}

export interface Nightshift extends Llm { status(): Promise<RuntimeStatus> }

export function createNightshift(cfg: Config['meterless'], fetchImpl: typeof fetch = fetch): Nightshift {
  const base = normalizeBaseUrl(cfg.baseUrl);
  const hasToken = cfg.token !== '' && cfg.token !== PLACEHOLDER_TOKEN;
  const headers = (chat: boolean) => ({
    authorization: `Bearer ${cfg.token}`,
    'content-type': 'application/json',
    'meterless-app': 'ledger-lens',
    ...(chat ? { 'meterless-scope': 'user' } : {}),
  });

  async function call(path: string, init: RequestInit, chat: boolean, timeoutMs: number): Promise<any> {
    if (!hasToken) {
      throw new NightshiftError('Meterless runtime token missing or placeholder: set METERLESS_RUNTIME_TOKEN from Nightshift > Console', 401);
    }
    let res: Response;
    try {
      res = await fetchImpl(base + path, { ...init, headers: headers(chat), signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      throw new NightshiftError(`Nightshift unreachable at ${base}: ${(e as Error).message}`, null);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new NightshiftError(`Nightshift ${res.status}: ${body?.error?.message ?? res.statusText}`, res.status);
    return body;
  }

  const ns: Nightshift = {
    async chat(messages: ChatMessage[], opts: ChatOptions = {}) {
      const body = await call('/chat/completions', {
        method: 'POST',
        body: JSON.stringify({
          model: opts.model ?? cfg.model,
          messages,
          max_tokens: opts.maxTokens ?? 2000, // reasoning eats ~200+ tokens before the answer
          temperature: opts.temperature ?? 0,
        }),
      }, true, CHAT_TIMEOUT_MS);
      const content = stripReasoning(body?.choices?.[0]?.message?.content ?? '');
      if (!content) throw new NightshiftError('Nightshift returned an empty reply (raise maxTokens?)', 200);
      return content;
    },
    generate: prompt => ns.chat([{ role: 'user', content: prompt }]),
    async listModels() {
      const body = await call('/models', { method: 'GET' }, false, 10_000);
      return (body?.data ?? []).map((m: { id: string }) => m.id);
    },
    async status() {
      try {
        const ids = await ns.listModels();
        return ids.some(id => id.startsWith('meterless/')) ? 'online' : 'offline';
      } catch (e) {
        const s = (e as NightshiftError).status;
        return s === 401 || s === 403 ? 'unauthorized' : 'offline';
      }
    },
  };
  return ns;
}

/** Probe the usual runtime ports; first online-or-unauthorized base URL in contract order, else null. */
export async function autoDetect(token: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const candidates = ['127.0.0.1', 'localhost', '[::1]'].flatMap(host =>
    [8088, 8090, 8787, 11434].map(port => `http://${host}:${port}/v1`));
  const results = await Promise.all(candidates.map(baseUrl =>
    createNightshift({ baseUrl, token: token || 'probe', model: '', deepModel: '' }, fetchImpl).status()));
  return candidates.find((_, i) => results[i] !== 'offline') ?? null;
}
