import {
  autoDetect, createNightshift, NightshiftError, normalizeBaseUrl, parseConnectLink, stripReasoning,
} from '../src/llm/nightshift.ts';

const cfg = { baseUrl: 'http://ns/v1/', token: 't', model: 'fast', deepModel: 'deep' };
const reply = (content: string) => ({ choices: [{ message: { content } }] });

function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

test('chat sends contract headers and defaults', async () => {
  const f = fakeFetch(reply('hi'));
  expect(await createNightshift(cfg, f.fn).chat([{ role: 'user', content: 'x' }])).toBe('hi');
  const { url, init } = f.calls[0];
  expect(url).toBe('http://ns/v1/chat/completions');
  expect(init.method).toBe('POST');
  expect(init.headers).toMatchObject({
    authorization: 'Bearer t', 'meterless-app': 'ledger-lens', 'meterless-scope': 'user',
  });
  expect(JSON.parse(init.body as string)).toMatchObject({ model: 'fast', max_tokens: 2000, temperature: 0 });
});

test('opts override model and maxTokens', async () => {
  const f = fakeFetch(reply('hi'));
  await createNightshift(cfg, f.fn).chat([{ role: 'user', content: 'x' }], { model: 'd', maxTokens: 500 });
  expect(JSON.parse(f.calls[0].init.body as string)).toMatchObject({ model: 'd', max_tokens: 500 });
});

test('strips reasoning before </think>', async () => {
  const f = fakeFetch(reply('thinking…</think>{"ok": true}'));
  expect(await createNightshift(cfg, f.fn).chat([{ role: 'user', content: 'x' }])).toBe('{"ok": true}');
  expect(stripReasoning('<think>a</think>\n b ')).toBe('b');
  expect(stripReasoning('plain')).toBe('plain');
});

test('empty content throws', async () => {
  const p = createNightshift(cfg, fakeFetch(reply('')).fn).chat([{ role: 'user', content: 'x' }]);
  await expect(p).rejects.toBeInstanceOf(NightshiftError);
  await expect(p).rejects.toThrow(/empty/);
});

test('HTTP error carries status and provider message', async () => {
  const f = fakeFetch({ error: { message: 'nvidia_404: not found' } }, 502);
  const err = await createNightshift(cfg, f.fn).chat([{ role: 'user', content: 'x' }]).catch(e => e);
  expect(err).toBeInstanceOf(NightshiftError);
  expect(err.status).toBe(502);
  expect(err.message).toContain('nvidia_404');
});

test('network failure', async () => {
  const fn = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
  const err = await createNightshift(cfg, fn).chat([{ role: 'user', content: 'x' }]).catch(e => e);
  expect(err).toBeInstanceOf(NightshiftError);
  expect(err.status).toBeNull();
});

test('listModels returns ids', async () => {
  const f = fakeFetch({ data: [{ id: 'a' }, { id: 'b' }] });
  expect(await createNightshift(cfg, f.fn).listModels()).toEqual(['a', 'b']);
  expect(f.calls[0].url).toBe('http://ns/v1/models');
});

test('normalizeBaseUrl turns any pasted form into <host>/v1', () => {
  for (const input of ['127.0.0.1:8088', 'http://127.0.0.1:8088', 'http://127.0.0.1:8088/', 'http://127.0.0.1:8088/v1',
    'http://127.0.0.1:8088/v1/', 'http://127.0.0.1:8088/v1/chat/completions', 'http://127.0.0.1:8088/v1/models',
    'http://127.0.0.1:8088/healthz', 'http://127.0.0.1:8088/v1/v1']) {
    expect(normalizeBaseUrl(input)).toBe('http://127.0.0.1:8088/v1');
  }
  expect(normalizeBaseUrl('https://ns.example:9000/v1')).toBe('https://ns.example:9000/v1');
});

test('parseConnectLink takes origin + /v1 and key k', () => {
  expect(parseConnectLink('http://192.168.1.20:8088/connect#k=abc123'))
    .toEqual({ baseUrl: 'http://192.168.1.20:8088/v1', token: 'abc123' });
  expect(parseConnectLink('http://127.0.0.1:8088/v1')).toBeNull();
  expect(parseConnectLink('not a url')).toBeNull();
});

test('placeholder or missing token is rejected without calling the runtime', async () => {
  for (const token of ['rt-local', '']) {
    const f = fakeFetch(reply('hi'));
    const err = await createNightshift({ ...cfg, token }, f.fn).chat([{ role: 'user', content: 'x' }]).catch(e => e);
    expect(err).toBeInstanceOf(NightshiftError);
    expect(err.status).toBe(401);
    expect(f.calls).toHaveLength(0);
  }
});

test('status: 401/403 unauthorized, 200 with meterless ids online, else offline', async () => {
  const s = (body: unknown, code = 200) => createNightshift(cfg, fakeFetch(body, code).fn).status();
  expect(await s({ error: {} }, 401)).toBe('unauthorized');
  expect(await s({ error: {} }, 403)).toBe('unauthorized');
  expect(await s({ data: [{ id: 'meterless/auto' }, { id: 'nvidia/x' }] })).toBe('online');
  expect(await s({ data: [{ id: 'nvidia/x' }] })).toBe('offline');
  expect(await s({}, 500)).toBe('offline');
  const down = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
  expect(await createNightshift(cfg, down).status()).toBe('offline');
  expect(await createNightshift({ ...cfg, token: 'rt-local' }, fakeFetch({ data: [] }).fn).status()).toBe('unauthorized');
});

test('autoDetect returns the first online or unauthorized runtime', async () => {
  const hits: Record<string, number> = { 'http://localhost:8787/v1/models': 401, 'http://[::1]:8088/v1/models': 200 };
  const fn = (async (url: string) => {
    if (!(url in hits)) throw new TypeError('fetch failed');
    return new Response(JSON.stringify({ data: [{ id: 'meterless/auto' }] }), { status: hits[url] });
  }) as unknown as typeof fetch;
  expect(await autoDetect('t', fn)).toBe('http://localhost:8787/v1');
  const none = (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch;
  expect(await autoDetect('t', none)).toBeNull();
});

test('generate is a single user message', async () => {
  const f = fakeFetch(reply('ok'));
  expect(await createNightshift(cfg, f.fn).generate('hello')).toBe('ok');
  expect(JSON.parse(f.calls[0].init.body as string).messages).toEqual([{ role: 'user', content: 'hello' }]);
});
