import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildContainer } from '../src/composition/container';
import { loadEnv } from '../src/config/env';

export const ROOT = resolve(import.meta.dirname, '../../..');

export const silentLogger = { info() {}, warn() {}, error() {} };

/** Contenedor en MOCK_MODE con tiempos cortos y carpetas temporales. */
export function mockContainer() {
  const tmp = mkdtempSync(join(tmpdir(), 'rp-'));
  const env = loadEnv({
    MOCK_MODE: 'true',
    WORK_DIR: join(tmp, 'work'),
    AUDIT_DIR: join(tmp, 'audit'),
    POLL_ATTEMPTS: '20',
  });
  return buildContainer(env, silentLogger, ROOT, { publishDelayMs: 60, pollIntervalMs: 20 });
}

export async function waitFor(check: () => Promise<boolean>, timeoutMs = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('waitFor: timeout');
}
