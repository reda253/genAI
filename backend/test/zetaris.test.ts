import {
  assertSelectOnly,
  createZetarisClient,
  qualifyViews,
  stripSqlComments,
  ZetarisError,
} from '../src/zetaris/client.ts';

const fixedNow = () => new Date('2026-10-01T08:00:00.000Z');

describe('read-only guard', () => {
  it('accepts SELECT, WITH and a trailing semicolon', () => {
    expect(() => assertSelectOnly('SELECT 1')).not.toThrow();
    expect(() => assertSelectOnly('  /* why */ SELECT * FROM t;  ')).not.toThrow();
    expect(() => assertSelectOnly('WITH x AS (SELECT 1) SELECT * FROM x')).not.toThrow();
  });

  it('rejects writes, multiple statements and empty SQL', () => {
    for (const sql of [
      'INSERT INTO t VALUES (1)',
      'DROP TABLE clients',
      'UPDATE invoices SET amount = 0',
      'SELECT 1; DELETE FROM clients',
      'WITH x AS (SELECT 1) DELETE FROM clients',
      '   ',
    ]) {
      expect(() => assertSelectOnly(sql)).toThrow(ZetarisError);
    }
  });

  it('does not treat a semicolon inside a string as a second statement', () => {
    expect(() => assertSelectOnly("SELECT 'a;b' AS value")).not.toThrow();
  });

  it('strips comments without touching quoted text', () => {
    expect(stripSqlComments("SELECT '--not a comment' -- real\n")).toContain("'--not a comment'");
    expect(stripSqlComments('/* why */ SELECT 1').trim()).toBe('SELECT 1');
  });
});

describe('view qualification', () => {
  it('prefixes unqualified contract views after FROM and JOIN', () => {
    expect(qualifyViews('SELECT * FROM client_profitability', 'ledger_lens')).toBe(
      'SELECT * FROM ledger_lens.client_profitability',
    );
    expect(qualifyViews('SELECT * FROM a JOIN ar_aging ON true', 'ledger_lens')).toBe(
      'SELECT * FROM a JOIN ledger_lens.ar_aging ON true',
    );
    expect(qualifyViews('SELECT * FROM fx_rates', 'ledger_lens')).toBe(
      'SELECT * FROM ledger_lens.fx_rates',
    );
  });

  it('leaves qualified views and other tables alone', () => {
    const sql = 'SELECT * FROM ledger_lens.cash_position JOIN other_table ON true';
    expect(qualifyViews(sql, 'ledger_lens')).toBe(sql);
  });
});

describe('live client', () => {
  it('POSTs the contract payload with auth and a fresh request id', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {} };
      return new Response(
        JSON.stringify({
          headers: ['client_id', 'hours_logged'],
          data: [['c01', '52']],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const client = createZetarisClient(
      {
        restUrl: 'http://zetaris:8888/api/v1.0/',
        apiKey: 'key',
        orgId: '1',
        mock: false,
        viewSchema: 'ledger_lens',
      },
      fetchImpl,
      fixedNow,
    );

    const result = await client.querySql('SELECT client_id, hours_logged FROM client_profitability');
    expect(result).toEqual({
      rows: [{ client_id: 'c01', hours_logged: '52' }],
      sql: 'SELECT client_id, hours_logged FROM ledger_lens.client_profitability',
      ranAt: '2026-10-01T08:00:00.000Z',
    });

    expect(captured!.url).toBe('http://zetaris:8888/api/v1.0/sql-editor/sqls/run');
    const headers = captured!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer key');
    expect(headers['x-org-id']).toBe('1');
    expect(headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    const body = JSON.parse(String(captured!.init.body));
    expect(body.sql).toContain('ledger_lens.client_profitability');
    expect(body.limit).toBe(1000);
  });

  it('surfaces HTTP errors without pretending there are rows', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { message: 'bad key' } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    const client = createZetarisClient(
      { restUrl: 'http://x/api/v1.0', apiKey: 'key', orgId: '1', mock: false },
      fetchImpl,
    );
    await expect(client.querySql('SELECT 1')).rejects.toThrow('Zetaris 401: bad key');
  });

  it('reports health from SELECT 1', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ headers: ['one'], data: [[1]] }), { status: 200 })) as typeof fetch;
    const client = createZetarisClient(
      { restUrl: 'http://x/api/v1.0', apiKey: 'key', orgId: '1', mock: false },
      fetchImpl,
    );
    await expect(client.ping()).resolves.toBe(true);
  });
});

describe('mock client', () => {
  const client = () => createZetarisClient(
    { restUrl: 'http://unused', apiKey: '', orgId: '1', mock: true },
    undefined,
    fixedNow,
  );

  it('filters the fixture rows like the fixed Leak Hunter checks', async () => {
    const unbilled = await client().querySql(
      `SELECT client_id, client_name, month, unbilled_hours, unbilled_pct, effective_rate
       FROM client_profitability WHERE unbilled_pct > 10 OR unbilled_hours > 0`,
    );
    expect(unbilled.rows).toHaveLength(2);
    expect(unbilled.rows.map((row) => row.month)).toEqual(['2026-08-01', '2026-09-01']);
    expect(unbilled.sql).toContain('FROM client_profitability');

    const adobe = await client().querySql(
      `SELECT subscription_id, vendor, price_change_pct FROM subscription_usage WHERE price_change_pct > 15`,
    );
    expect(adobe.rows).toEqual([
      { subscription_id: 'sub02', vendor: 'Adobe', price_change_pct: 20.9 },
    ]);

    const unused = await client().querySql(
      `SELECT subscription_id, days_since_login FROM subscription_usage WHERE days_since_login > 60`,
    );
    expect(unused.rows).toEqual([{ subscription_id: 'sub05', days_since_login: 94 }]);

    const late = await client().querySql(
      `SELECT invoice_id, days_late FROM ar_aging WHERE days_late > 30`,
    );
    expect(late.rows.map((row) => row.invoice_id)).toEqual(['inv0031', 'inv0038']);

    const duplicate = await client().querySql(
      `SELECT subscription_id, max_charges_in_a_month FROM subscription_usage WHERE max_charges_in_a_month > 1`,
    );
    expect(duplicate.rows).toEqual([{ subscription_id: 'sub03', max_charges_in_a_month: 2 }]);
  });

  it('supports a column-to-column threshold and is always healthy', async () => {
    const underpriced = await client().querySql(
      `SELECT client_id, client_name, hourly_rate, market_rate
       FROM client_profitability WHERE hourly_rate < market_rate * 0.9`,
    );
    expect(underpriced.rows).toHaveLength(6);
    expect(new Set(underpriced.rows.map((row) => row.client_id))).toEqual(new Set(['c07']));
    await expect(client().ping()).resolves.toBe(true);
  });

  it('rejects a query it cannot stand in for', async () => {
    await expect(client().querySql('SELECT * FROM unknown_view')).rejects.toThrow(ZetarisError);
  });
});
