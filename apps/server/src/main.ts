import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { buildContainer } from './composition/container';
import { loadEnv } from './config/env';
import { toLogger } from './infrastructure/runtime';
import { registerApi } from './presentation/http/server';

// Las rutas relativas del .env se resuelven desde la raíz del monorepo.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

async function main() {
  const env = loadEnv();
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
    },
  });
  const container = buildContainer(env, toLogger(app.log), ROOT);
  await registerApi(app, container, resolve(ROOT, 'apps/web/dist'));

  if (env.MOCK_MODE)
    app.log.warn('MOCK_MODE activo: Bitbucket, Artifactory y Jenkins están simulados.');

  const shutdown = async () => {
    app.log.info('Apagando: esperando jobs en curso…');
    await app.close();
    await container.runner.drain();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ host: env.HOST, port: env.PORT });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
