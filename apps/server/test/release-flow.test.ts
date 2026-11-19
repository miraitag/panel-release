import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerApi } from '../src/presentation/http/server';
import { mockContainer, waitFor } from './helpers';

let containers: ReturnType<typeof mockContainer>[] = [];
afterEach(async () => {
  await Promise.all(containers.map((c) => c.runner.drain()));
  containers = [];
});

function setup() {
  const c = mockContainer();
  containers.push(c);
  return c;
}

describe('flujo de release (MOCK_MODE)', () => {
  it('genera la versión, sube el tag y espera a Artifactory', async () => {
    const c = setup();
    const { jobIds } = await c.useCases.startRelease.execute(
      { items: [{ name: '@org/rn-auth', bump: 'minor' }] },
      'test',
    );
    const id = jobIds[0]!;
    await waitFor(async () => !(await c.useCases.getJob.execute(id)).isActive);

    const job = (await c.useCases.getJob.execute(id)).toDto();
    expect(job.status).toBe('succeeded');
    expect(job.to).toBe('5.2.0');
    expect(job.steps.find((s) => s.key === 'jenkins')?.state).toBe('external');
    expect(job.result?.tag).toBe('v5.2.0');
    expect(c.world?.published.get('@org/rn-auth')?.versions).toContain('5.2.0');
  });

  it('si falla la validación NO se crea el tag', async () => {
    const c = setup();
    c.world?.failVerify.add('rn-biometrics');
    const { jobIds } = await c.useCases.startRelease.execute(
      { items: [{ name: '@org/rn-biometrics', bump: 'minor' }] },
      'test',
    );
    await waitFor(async () => !(await c.useCases.getJob.execute(jobIds[0]!)).isActive);

    const job = (await c.useCases.getJob.execute(jobIds[0]!)).toDto();
    expect(job.status).toBe('failed');
    expect(job.steps.find((s) => s.key === 'verify')?.state).toBe('failed');
    expect(job.steps.find((s) => s.key === 'tag')?.state).toBe('pending');
    expect(c.world?.tags.size).toBe(0);
  });

  it('rechaza un segundo release de la misma librería (lock)', async () => {
    const c = setup();
    await c.useCases.startRelease.execute(
      { items: [{ name: '@org/rn-auth', bump: 'patch' }] },
      'test',
    );
    await expect(
      c.useCases.startRelease.execute({ items: [{ name: '@org/rn-auth', bump: 'patch' }] }, 'test'),
    ).rejects.toThrow(/en curso/);
  });

  it('rechaza paquetes fuera del catálogo', async () => {
    const c = setup();
    await expect(
      c.useCases.startRelease.execute({ items: [{ name: 'left-pad', bump: 'patch' }] }, 'test'),
    ).rejects.toThrow(/catálogo/);
  });
});

describe('API HTTP', () => {
  it('lista librerías, valida el cuerpo y sincroniza el wrapper', async () => {
    const c = setup();
    const app = Fastify({ logger: false });
    await registerApi(app, c);

    const libs = await app.inject({ method: 'GET', url: '/api/libraries' });
    expect(libs.statusCode).toBe(200);
    const body = libs.json() as { libraries: { name: string; status: string }[] };
    expect(body.libraries).toHaveLength(6);
    expect(body.libraries.find((l) => l.name === '@org/rn-auth')?.status).toBe('pending-publish');
    expect(body.libraries.find((l) => l.name === '@org/rn-storage')?.status).toBe('major-review');

    const bad = await app.inject({ method: 'POST', url: '/api/releases', payload: { items: [] } });
    expect(bad.statusCode).toBe(400);

    const major = await app.inject({
      method: 'POST',
      url: '/api/wrapper/sync',
      payload: { specs: [{ name: '@org/rn-storage', version: '4.0.1' }] },
    });
    expect(major.statusCode).toBe(400);

    const sync = await app.inject({
      method: 'POST',
      url: '/api/wrapper/sync',
      payload: { specs: [{ name: '@org/rn-analytics', version: '1.9.2' }] },
    });
    expect(sync.statusCode).toBe(200);
    expect(sync.json()).toMatchObject({ specs: ['@org/rn-analytics@^1.9.2'] });
    await app.close();
  });
});
