// Zetaris client (P2): the single read path for every agent number.
//
// Contract (docs/contracts.md §2):
//   querySql(sql) -> { rows, sql, ranAt }
//   * POST <restUrl>/sql-editor/sqls/run
//   * Authorization: Bearer <ZETARIS_API_KEY>
//   * X-Org-ID: <ZETARIS_ORG_ID>
//   * X-Request-ID: a fresh UUID on every call
//   * SELECT (or WITH ... SELECT) only, one statement per call
//   * ZETARIS_MOCK=1 -> rows from backend/src/zetaris/mock/<view>.json
//
// The four contract views live in one SchemaStore container. Agents may write
// `FROM client_profitability`; this client prefixes the container so the SQL
// that actually runs (and is stored as evidence) is `FROM ledger_lens.client_profitability`.
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { QueryResult } from '../agents/types.ts';

export const CONTRACT_VIEWS = [
  'client_profitability',
  'cash_position',
  'subscription_usage',
  'ar_aging',
] as const;
export type ContractView = (typeof CONTRACT_VIEWS)[number];

const MOCK_VIEWS = [...CONTRACT_VIEWS, 'fx_rates'] as const;
const QUALIFIED_VIEWS = [...CONTRACT_VIEWS, 'fx_rates'] as const;
const MOCK_DIR = fileURLToPath(new URL('./mock/', import.meta.url));

export class ZetarisError extends Error {
  constructor(message: string, public status: number | null = null) {
    super(message);
    this.name = 'ZetarisError';
  }
}

export interface ZetarisConfig {
  restUrl: string;
  apiKey: string;
  orgId: string;
  mock: boolean;
  /** SchemaStore container that holds the four contract views. */
  viewSchema?: string;
  /** Override for tests; defaults to backend/src/zetaris/mock. */
  mockDir?: string;
  queryLimit?: number;
  timeoutMs?: number;
}

export interface ZetarisClient {
  querySql(sql: string): Promise<QueryResult>;
  /** True when the API answers SELECT 1 (mock mode is always usable). */
  ping(): Promise<boolean>;
}

/** Remove -- and /* *\/ comments without touching quoted strings. */
export function stripSqlComments(sql: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    if (quote) {
      out += c;
      if (c === quote) {
        if (sql[i + 1] === quote) {
          out += sql[i + 1];
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      out += c;
      continue;
    }
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    out += c;
  }
  return out;
}

const WRITE_KEYWORDS = new Set([
  'insert', 'update', 'delete', 'merge', 'drop', 'create', 'alter',
  'truncate', 'grant', 'revoke', 'copy', 'call', 'set', 'use',
]);

/** Word scan outside quoted strings, so 'delete' in a literal is harmless. */
function hasWriteKeyword(sql: string): boolean {
  let unquoted = '';
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    if (quote) {
      if (c === quote) {
        if (sql[i + 1] === quote) i += 1;
        else quote = null;
      }
      unquoted += ' ';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      unquoted += ' ';
      continue;
    }
    unquoted += c;
  }
  return (unquoted.match(/[a-zA-Z_]+/g) ?? []).some((word) =>
    WRITE_KEYWORDS.has(word.toLowerCase()),
  );
}

/** Throw unless sql is exactly one read-only statement. */
export function assertSelectOnly(sql: string): void {
  const clean = stripSqlComments(sql).trim();
  if (!clean) throw new ZetarisError('empty SQL');
  if (!/^(select|with)\b/i.test(clean)) {
    throw new ZetarisError('Zetaris is read-only: only SELECT queries are allowed');
  }
  if (hasWriteKeyword(clean)) {
    throw new ZetarisError('Zetaris is read-only: only SELECT queries are allowed');
  }

  let quote: string | null = null;
  for (let i = 0; i < clean.length; i += 1) {
    const c = clean[i];
    if (quote) {
      if (c === quote) {
        if (clean[i + 1] === quote) i += 1;
        else quote = null;
      }
    } else if (c === "'" || c === '"' || c === '`') {
      quote = c;
    } else if (c === ';' && clean.slice(i + 1).trim() !== '') {
      throw new ZetarisError('only one SQL statement per query is allowed');
    }
  }
}

/**
 * Prefix unqualified contract view names with the SchemaStore container.
 * Already-qualified names (ledger_lens.client_profitability) are left alone.
 */
export function qualifyViews(sql: string, schema: string): string {
  if (!schema) return sql;
  const names = QUALIFIED_VIEWS.join('|');
  const pattern = new RegExp(`\\b(from|join)(\\s+)(${names})\\b`, 'gi');
  return sql.replace(pattern, (_match, keyword: string, space: string, name: string) =>
    `${keyword}${space}${schema}.${name}`);
}

interface MockQuery {
  view: string;
  columns: string[];
  where: string | null;
}

function parseMockQuery(sql: string): MockQuery | null {
  const clean = stripSqlComments(sql).trim().replace(/;\s*$/, '').trim();
  const match = clean.match(
    /^select\s+([\s\S]+?)\s+from\s+([a-zA-Z_][\w]*)(?:\s+where\s+([\s\S]+))?$/i,
  );
  if (!match) return null;

  const view = match[2].toLowerCase();
  if (!(MOCK_VIEWS as readonly string[]).includes(view)) return null;

  const rawColumns = match[1].trim();
  const columns =
    rawColumns === '*'
      ? []
      : rawColumns.split(',').map((part) => {
          const alias = part.trim().replace(/^.*\s+as\s+/i, '');
          const name = alias.split('.').pop() ?? alias;
          return name.replace(/[`"]/g, '');
        });
  if (columns.some((name) => !/^[a-zA-Z_]\w*$/.test(name))) return null;

  return { view, columns, where: match[3]?.trim() ?? null };
}

function parseLiteral(token: string, row: Record<string, unknown>): unknown {
  const value = token.trim();
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.slice(1, -1);
  }
  if (/^true$/i.test(value)) return true;
  if (/^false$/i.test(value)) return false;
  if (/^null$/i.test(value)) return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  // A bare identifier is another column (e.g. hourly_rate < market_rate).
  const arithmetic = value.match(/^([a-zA-Z_]\w*)\s*\*\s*(-?\d+(?:\.\d+)?)$/);
  if (arithmetic) {
    const base = Number(row[arithmetic[1]]);
    return Number.isNaN(base) ? row[arithmetic[1]] : base * Number(arithmetic[2]);
  }
  if (/^[a-zA-Z_]\w*$/.test(value)) return row[value];
  return value;
}

function compare(left: unknown, op: string, right: unknown): boolean {
  if (left === null || left === undefined || right === null || right === undefined) {
    if (op === '=') return left === right;
    if (op === '!=' || op === '<>') return left !== right;
    return false;
  }

  const leftNumber = typeof left === 'number' ? left : Number(left);
  const rightNumber = typeof right === 'number' ? right : Number(right);
  const numeric =
    !Number.isNaN(leftNumber) &&
    !Number.isNaN(rightNumber) &&
    String(left).trim() !== '' &&
    String(right).trim() !== '';

  const a: number | string = numeric ? leftNumber : String(left);
  const b: number | string = numeric ? rightNumber : String(right);
  switch (op) {
    case '=':
      return a === b;
    case '!=':
    case '<>':
      return a !== b;
    case '>':
      return a > b;
    case '>=':
      return a >= b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    default:
      return false;
  }
}

/**
 * Tiny fixture engine for the simple `SELECT ... FROM view WHERE col op value`
 * checks the agents use. If a query is outside that subset it matches every
 * row, which is still shaped like the real view; tests exercise the filters.
 */
function filterMockRows(
  rows: Record<string, unknown>[],
  query: MockQuery,
): Record<string, unknown>[] {
  let filtered = rows;
  if (query.where) {
    if (/[()]/.test(query.where)) {
      filtered = rows;
    } else {
      const orGroups = query.where.split(/\s+or\s+/i);
      const matched: Record<string, unknown>[] = [];
      for (const row of rows) {
        const hit = orGroups.some((group) =>
          group.split(/\s+and\s+/i).every((condition) => {
            const part = condition.match(/^([a-zA-Z_]\w*)\s*(>=|<=|<>|!=|=|>|<)\s*(.+)$/);
            if (!part || !(part[1] in row)) return false;
            return compare(row[part[1]], part[2], parseLiteral(part[3], row));
          }),
        );
        if (hit) matched.push(row);
      }
      filtered = matched;
    }
  }

  if (query.columns.length === 0) return filtered;
  return filtered.map((row) => {
    const projected: Record<string, unknown> = {};
    for (const column of query.columns) projected[column] = row[column];
    return projected;
  });
}

function rowsFromResponse(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== 'object') {
    throw new ZetarisError('unexpected Zetaris response');
  }
  const payload = body as {
    data?: unknown;
    headers?: unknown;
    columns?: unknown;
    rows?: unknown;
  };
  if (Array.isArray(payload.rows)) return payload.rows as Record<string, unknown>[];
  if (!Array.isArray(payload.data)) return [];

  const headers = Array.isArray(payload.headers)
    ? payload.headers
    : Array.isArray(payload.columns)
      ? payload.columns
      : null;

  return payload.data.map((row) => {
    if (!Array.isArray(row)) return row as Record<string, unknown>;
    if (!headers) throw new ZetarisError('Zetaris response is missing column headers');
    return Object.fromEntries(headers.map((header, index) => [String(header), row[index]]));
  });
}

export function createZetarisClient(
  cfg: ZetarisConfig,
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
): ZetarisClient {
  const restUrl = cfg.restUrl.replace(/\/+$/, '');
  const viewSchema = cfg.viewSchema ?? 'ledger_lens';
  const mockDir = cfg.mockDir ?? MOCK_DIR;
  const fixtures = new Map<string, Promise<Record<string, unknown>[]>>();

  function loadFixture(view: string): Promise<Record<string, unknown>[]> {
    let fixture = fixtures.get(view);
    if (!fixture) {
      fixture = readFile(join(mockDir, `${view}.json`), 'utf8').then((text) => {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new ZetarisError(`mock ${view}.json is not an array`);
        return parsed as Record<string, unknown>[];
      });
      fixtures.set(view, fixture);
    }
    return fixture;
  }

  async function queryMock(sql: string): Promise<QueryResult> {
    const query = parseMockQuery(sql);
    if (!query) {
      throw new ZetarisError(
        `mock mode only supports simple queries over ${MOCK_VIEWS.join(', ')}`,
      );
    }
    const rows = filterMockRows(await loadFixture(query.view), query);
    return { rows, sql, ranAt: now().toISOString() };
  }

  async function queryLive(sql: string): Promise<QueryResult> {
    if (!cfg.apiKey) {
      throw new ZetarisError('ZETARIS_API_KEY is not set (or set ZETARIS_MOCK=1)', 401);
    }
    const executedSql = qualifyViews(sql, viewSchema);
    let response: Response;
    try {
      response = await fetchImpl(`${restUrl}/sql-editor/sqls/run`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${cfg.apiKey}`,
          'content-type': 'application/json',
          'x-org-id': cfg.orgId,
          'x-request-id': randomUUID(),
        },
        body: JSON.stringify({
          queryId: randomUUID(),
          sql: executedSql,
          source: 'SqlEditor',
          limit: cfg.queryLimit ?? 1000,
        }),
        signal: AbortSignal.timeout(cfg.timeoutMs ?? 120_000),
      });
    } catch (error) {
      throw new ZetarisError(
        `Zetaris unreachable at ${restUrl}: ${(error as Error).message}`,
        null,
      );
    }

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const detail =
        (body as { error?: { message?: string }; message?: string } | null)?.error?.message ??
        (body as { message?: string } | null)?.message ??
        response.statusText;
      throw new ZetarisError(`Zetaris ${response.status}: ${detail}`, response.status);
    }
    return { rows: rowsFromResponse(body), sql: executedSql, ranAt: now().toISOString() };
  }

  return {
    async querySql(sql: string): Promise<QueryResult> {
      assertSelectOnly(sql);
      return cfg.mock ? queryMock(sql) : queryLive(sql);
    },
    async ping(): Promise<boolean> {
      if (cfg.mock) return true;
      try {
        await queryLive('SELECT 1 AS one');
        return true;
      } catch {
        return false;
      }
    },
  };
}
