import { existsSync } from 'node:fs';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, type ZodType } from 'zod';
import {
  StartReleaseRequestSchema,
  SyncWrapperRequestSchema,
  type ApiError,
  type JobEvent,
} from '@release-panel/shared';
import type { Container } from '../../composition/container';
import { DomainError, ValidationError } from '../../domain/errors';

const STATUS: Record<string, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  STEP_FAILED: 502,
  CANCELLED: 409,
};

function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => i.message).join('; '));
  return r.data;
}

function userOf(req: FastifyRequest): string {
  const h = req.headers['x-user'];
  return (Array.isArray(h) ? h[0] : h)?.slice(0, 80) || 'panel';
}

/** Controladores delgados: validan, llaman al caso de uso y serializan. */
export async function registerApi(
  app: FastifyInstance,
  c: Container,
  webDist?: string,
): Promise<FastifyInstance> {
  await app.register(cors, { origin: c.env.WEB_ORIGIN });

  app.setErrorHandler((err, _req, reply) => {
    const body = (code: string, message: string): ApiError => ({ error: { code, message } });
    if (err instanceof DomainError)
      return reply.status(STATUS[err.code] ?? 500).send(body(err.code, err.message));
    if (err instanceof ZodError) return reply.status(400).send(body('VALIDATION', err.message));
    app.log.error(err);
    return reply.status(500).send(body('INTERNAL', 'Error interno. Revisa los logs del servidor.'));
  });

  app.get('/api/health', async () => ({ ok: true, mock: c.env.MOCK_MODE }));

  app.get('/api/libraries', async (req) => {
    const q = req.query as { refresh?: string };
    return c.useCases.getLibraries.execute({ refresh: q.refresh === 'true' });
  });

  app.post('/api/libraries/refresh', async () =>
    c.useCases.getLibraries.execute({ refresh: true }),
  );

  app.get('/api/libraries/:name/changesets', async (req) => {
    const { name } = req.params as { name: string };
    return c.useCases.getChangesets.execute(decodeURIComponent(name));
  });

  app.post('/api/releases', async (req, reply) => {
    const body = parse(StartReleaseRequestSchema, req.body);
    const res = await c.useCases.startRelease.execute(body, userOf(req));
    return reply.status(202).send(res);
  });

  app.get('/api/jobs', async () => ({ jobs: await c.useCases.listJobs.execute() }));

  app.get('/api/jobs/:id', async (req) => {
    const { id } = req.params as { id: string };
    return (await c.useCases.getJob.execute(id)).toDto();
  });

  app.post('/api/jobs/:id/cancel', async (req, reply) => {
    const { id } = req.params as { id: string };
    await c.useCases.cancelJob.execute(id);
    return reply.status(202).send({ ok: true });
  });

  app.get('/api/jobs/:id/stream', (req, reply) => streamJob(c, req, reply));

  app.get('/api/wrapper', async () => c.useCases.getWrapper.execute());

  app.post('/api/wrapper/sync', async (req) => {
    const body = parse(SyncWrapperRequestSchema, req.body);
    return c.useCases.syncWrapper.execute(body);
  });

  // En producción el mismo proceso sirve el build de la web (SPA).
  if (webDist && existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api/')
        ? reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } })
        : reply.sendFile('index.html'),
    );
  }

  return app;
}

/** Server-Sent Events: reenvía el historial y luego los eventos en vivo. */
async function streamJob(c: Container, req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  const job = await c.useCases.getJob.execute(id);

  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': c.env.WEB_ORIGIN,
  });
  const send = (e: JobEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);

  send({ type: 'job', job: job.toDto() });
  for (const entry of job.logs) send({ type: 'log', ...entry });

  const unsubscribe = c.events.subscribe(id, send);
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.raw.on('close', () => {
    clearInterval(ping);
    unsubscribe();
  });
}
