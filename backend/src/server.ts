// The 10 routes of docs/contracts.md §4. Errors: { error: { code, message } }.
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { createOrchestrator, NoRunYetError, NotFoundError, RunInProgressError } from './agents/orchestrator.ts';
import type { Scenario } from './agents/types.ts';
import type { RuntimeStatus } from './llm/nightshift.ts';

export interface ServerDeps {
  orchestrator: ReturnType<typeof createOrchestrator>;
  checks: { zetaris(): Promise<boolean>; nightshift(): Promise<RuntimeStatus> };
  /** Built web app (web/dist) to serve on the same port; the Docker image sets it. */
  webDir?: string;
}

const explainBody = {
  type: 'object', required: ['question'],
  properties: { question: { type: 'string', minLength: 1 }, finding_id: { type: ['string', 'null'] } },
};
const whatIfBody = {
  oneOf: [
    { type: 'object', required: ['type', 'client_id'],
      properties: { type: { const: 'lose_client' }, client_id: { type: 'string', pattern: '^c\\d{2}$' } } },
    { type: 'object', required: ['type', 'pct'],
      properties: { type: { const: 'raise_prices' }, pct: { type: 'number', exclusiveMinimum: 0, maximum: 100 } } },
  ],
};
const decisionBody = {
  type: 'object', required: ['decision'],
  properties: { decision: { enum: ['approve', 'reject'] }, note: { type: ['string', 'null'] } },
};

export function buildServer({ orchestrator: o, checks, webDir }: ServerDeps): FastifyInstance {
  const app = Fastify();
  app.register(cors, { origin: 'http://localhost:5173' });
  if (webDir) app.register(fastifyStatic, { root: webDir });
  // Allow an empty body with content-type: application/json (fetch helpers send it on POST /api/runs).
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    try {
      done(null, body ? JSON.parse(body as string) : undefined);
    } catch (e) {
      (e as { statusCode?: number }).statusCode = 400;
      done(e as Error, undefined);
    }
  });

  app.setErrorHandler((err: any, _req, reply) => {
    const send = (status: number, code: string, extra = {}) =>
      reply.status(status).send({ error: { code, message: err.message, ...extra } });
    if (err instanceof RunInProgressError) return send(409, 'run_in_progress', { run_id: err.runId });
    if (err instanceof NoRunYetError) return send(404, 'no_run_yet');
    if (err instanceof NotFoundError) return send(404, 'not_found');
    if (err.validation) return send(400, 'bad_request');
    // Fastify's own client errors: bad JSON (400), wrong content-type (415), body too large (413)
    if (err.statusCode >= 400 && err.statusCode < 500) return send(err.statusCode, 'bad_request');
    return send(500, 'internal');
  });
  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ error: { code: 'not_found', message: `no route ${req.method} ${req.url}` } }));

  app.get('/api/health', async () => {
    const [zetaris, status] = await Promise.all([checks.zetaris(), checks.nightshift()]);
    return { ok: true, zetaris, nightshift: status === 'online', nightshift_status: status };
  });

  app.post('/api/runs', async (_req, reply) => reply.status(202).send(o.startRun()));
  app.get<{ Params: { id: string } }>('/api/runs/:id', async req => o.getRun(req.params.id));

  app.get('/api/brief', async () => o.latest().brief);
  app.get('/api/findings', async () => o.latest().findings);
  app.get<{ Params: { id: string } }>('/api/findings/:id', async req => {
    const f = o.latest().findings.find(x => x.id === req.params.id);
    if (!f) throw new NotFoundError(`finding ${req.params.id} not found`);
    return f;
  });

  app.post<{ Body: { question: string; finding_id?: string | null } }>(
    '/api/explain', { schema: { body: explainBody } },
    async req => o.explain(req.body.question, req.body.finding_id ?? null));

  app.get('/api/forecast', async () => o.latest().forecast);
  app.post<{ Body: Scenario }>('/api/forecast/what-if', { schema: { body: whatIfBody } }, async req => o.whatIf(req.body));

  app.post<{ Params: { id: string }; Body: { decision: 'approve' | 'reject'; note?: string | null } }>(
    '/api/moves/:id/decision', { schema: { body: decisionBody } },
    async req => o.decide(req.params.id, req.body.decision, req.body.note ?? null));

  return app;
}
