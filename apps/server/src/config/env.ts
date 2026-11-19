import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z
  .object({
    MOCK_MODE: bool,
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().positive().default(4310),
    WEB_ORIGIN: z.string().default('http://localhost:5173'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    LIBRARIES_CONFIG: z.string().default('./config/libraries.config.json'),
    WORK_DIR: z.string().default('./.work'),
    AUDIT_DIR: z.string().default('./.audit'),
    ARTIFACTORY_NPM_URL: z.string().default(''),
    ARTIFACTORY_TOKEN: z.string().default(''),
    BITBUCKET_FLAVOR: z.enum(['cloud', 'datacenter']).default('cloud'),
    BITBUCKET_API_URL: z.string().default('https://api.bitbucket.org/2.0'),
    BITBUCKET_WORKSPACE: z.string().default(''),
    BITBUCKET_TOKEN: z.string().default(''),
    BITBUCKET_MAIN_BRANCH: z.string().default('main'),
    GIT_REMOTE_TEMPLATE: z.string().default('git@bitbucket.org:{workspace}/{repo}.git'),
    GIT_AUTHOR_NAME: z.string().default('Release Panel'),
    GIT_AUTHOR_EMAIL: z.string().default('release-panel@example.com'),
    TAG_FORMAT: z.string().default('v{version}'),
    POLL_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
    POLL_ATTEMPTS: z.coerce.number().int().positive().default(40),
  })
  .superRefine((env, ctx) => {
    if (env.MOCK_MODE) return;
    // Fuera de modo mock, faltar una credencial es un error de arranque (falla rápido).
    for (const key of ['ARTIFACTORY_NPM_URL', 'BITBUCKET_WORKSPACE', 'BITBUCKET_TOKEN'] as const) {
      if (!env[key] || env[key].includes('[')) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} es obligatoria sin MOCK_MODE`,
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(
      `Configuración inválida:\n${lines.join('\n')}\nRevisa tu archivo .env (ver .env.example).`,
    );
  }
  return parsed.data;
}
