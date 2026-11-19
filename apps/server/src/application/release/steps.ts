import { CancelledError, StepFailedError } from '../../domain/errors';
import {
  createChangeset,
  isChangesetFile,
  parseChangeset,
  rewriteChangesetBump,
} from '../../domain/changeset';
import type {
  GitPort,
  PackageManagerResolver,
  PackageRegistry,
  RunOptions,
  Workspace,
} from '../../domain/ports';
import {
  StepTimeoutError,
  type ReleaseContext,
  type ReleaseStep,
  type StepOutcome,
} from './pipeline';

export interface ReleaseSettings {
  mainBranch: string;
  tagFormat: string;
  pollIntervalMs: number;
  pollAttempts: number;
  gitEnv: Record<string, string>;
}

export function formatTag(format: string, name: string, version: string): string {
  return format.replaceAll('{name}', name).replaceAll('{version}', version);
}

const runOpts = (ctx: ReleaseContext, env?: Record<string, string>): RunOptions => ({
  cwd: requireDir(ctx),
  onLine: ctx.log,
  signal: ctx.signal,
  ...(env ? { env } : {}),
});

function requireDir(ctx: ReleaseContext): string {
  if (!ctx.dir) throw new StepFailedError('No hay clon de trabajo');
  return ctx.dir;
}

export class CloneStep implements ReleaseStep {
  readonly key = 'clone' as const;
  constructor(
    private readonly workspace: Workspace,
    private readonly git: GitPort,
    private readonly settings: ReleaseSettings,
  ) {}
  async execute(ctx: ReleaseContext): Promise<StepOutcome> {
    const dir = await this.workspace.create(ctx.job.id, ctx.job.repo);
    ctx.dir = dir;
    await this.git.clone(ctx.job.repo, dir, this.settings.mainBranch, runOpts(ctx));
    return { state: 'done' };
  }
}

export class PreflightStep implements ReleaseStep {
  readonly key = 'preflight' as const;
  constructor(
    private readonly git: GitPort,
    private readonly registry: PackageRegistry,
    private readonly workspace: Workspace,
    private readonly settings: ReleaseSettings,
  ) {}
  async execute(ctx: ReleaseContext): Promise<StepOutcome> {
    const dir = requireDir(ctx);
    const { job } = ctx;
    const branch = await this.git.currentBranch(dir);
    if (branch !== this.settings.mainBranch) {
      throw new StepFailedError(
        `Solo se publica desde ${this.settings.mainBranch} (rama actual: ${branch})`,
      );
    }
    if (!(await this.git.isClean(dir)))
      throw new StepFailedError('El árbol de trabajo no está limpio');
    ctx.log(`✔ rama ${branch} limpia`);

    const pkg = JSON.parse((await this.workspace.readText(dir, 'package.json')) ?? '{}') as {
      version?: string;
    };
    if (pkg.version !== job.from) {
      throw new StepFailedError(
        `package.json está en ${pkg.version ?? '?'} y se esperaba ${job.from}. Refresca el mapa.`,
      );
    }

    // Idempotencia: si la versión ya existe, no hay nada que publicar.
    if (await this.registry.versionExists(job.library, job.to)) {
      ctx.log(`La versión ${job.to} ya existe en Artifactory: no hay nada que publicar.`);
      return { state: 'done', detail: 'Versión ya publicada', finishEarly: true };
    }
    const tag = formatTag(this.settings.tagFormat, job.library, job.to);
    if (await this.git.remoteTagExists(dir, tag)) {
      throw new StepFailedError(
        `El tag ${tag} ya existe en Bitbucket pero la versión no está en Artifactory. Revisa Jenkins.`,
      );
    }
    ctx.log(`✔ ${tag} no existe todavía`);
    return { state: 'done' };
  }
}

export class InstallStep implements ReleaseStep {
  readonly key = 'install' as const;
  constructor(private readonly resolver: PackageManagerResolver) {}
  async execute(ctx: ReleaseContext): Promise<StepOutcome> {
    const pm = await this.resolver.fromDirectory(requireDir(ctx));
    ctx.pm = pm;
    ctx.log(`Gestor detectado: ${pm.name} (${pm.lockfile})`);
    await pm.install(requireDir(ctx), runOpts(ctx));
    return { state: 'done', detail: pm.name };
  }
}

/** Ajusta los changesets para que `changeset version` produzca exactamente la versión elegida. */
export class AdjustBumpStep implements ReleaseStep {
  readonly key = 'adjust-bump' as const;
  constructor(private readonly workspace: Workspace) {}
  async execute(ctx: ReleaseContext): Promise<StepOutcome> {
    const dir = requireDir(ctx);
    const { job } = ctx;
    const files = (await this.workspace.list(dir, '.changeset')).filter(isChangesetFile);
    let touched = 0;
    for (const file of files) {
      const rel = `.changeset/${file}`;
      const content = (await this.workspace.readText(dir, rel)) ?? '';
      const cs = parseChangeset(file, content, job.library);
      if (!cs) continue;
      touched++;
      if (cs.bump !== job.bump) {
        await this.workspace.writeText(
          dir,
          rel,
          rewriteChangesetBump(content, job.library, job.bump),
        );
        ctx.log(`${rel}: ${cs.bump} → ${job.bump}`);
      }
    }
    if (touched === 0) {
      await this.workspace.writeText(
        dir,
        '.changeset/release-panel.md',
        createChangeset(job.library, job.bump, `Release ${job.to} generado desde Release Panel.`),
      );
      ctx.log('No había changesets: se creó .changeset/release-panel.md');
    }
    return { state: 'done', detail: job.bump };
  }
}

export class BumpStep implements ReleaseStep {
  readonly key = 'bump' as const;
  constructor(private readonly workspace: Workspace) {}
  async execute(ctx: ReleaseContext): Promise<StepOutcome> {
    const dir = requireDir(ctx);
    await ctx.pm!.runScript(dir, 'release:bump', runOpts(ctx));
    const pkg = JSON.parse((await this.workspace.readText(dir, 'package.json')) ?? '{}') as {
      version?: string;
    };
    if (pkg.version !== ctx.job.to) {
      throw new StepFailedError(
        `changeset version dejó ${pkg.version ?? '?'} y se esperaba ${ctx.job.to}`,
      );
    }
    return { state: 'done', detail: `package.json en ${pkg.version}` };
  }
}

export class VerifyStep implements ReleaseStep {
  readonly key = 'verify' as const;
  async execute(ctx: ReleaseContext): Promise<StepOutcome> {
    await ctx.pm!.runScript(requireDir(ctx), 'release:verify', runOpts(ctx));
    return { state: 'done' };
  }
}

/** Punto de no retorno: commit + tag + push vía el script del repo. */
export class TagStep implements ReleaseStep {
  readonly key = 'tag' as const;
  constructor(private readonly settings: ReleaseSettings) {}
  async execute(ctx: ReleaseContext): Promise<StepOutcome> {
    const res = await ctx.pm!.runScript(
      requireDir(ctx),
      'release:tag',
      runOpts(ctx, this.settings.gitEnv),
    );
    try {
      const out = JSON.parse(res.lastLine) as { tag?: string; commit?: string };
      ctx.job.setResult({
        ...(out.tag ? { tag: out.tag } : {}),
        ...(out.commit ? { commit: out.commit } : {}),
      });
    } catch {
      ctx.job.setResult({ tag: formatTag(this.settings.tagFormat, ctx.job.library, ctx.job.to) });
    }
    ctx.log('→ Tag subido. Desde aquí Jenkins publica por su cuenta.');
    return { state: 'done', detail: ctx.job.toDto().result?.tag ?? '' };
  }
}

/** Marca el tramo externo: el panel no controla Jenkins. */
export class JenkinsStep implements ReleaseStep {
  readonly key = 'jenkins' as const;
  async execute(): Promise<StepOutcome> {
    return { state: 'external', detail: 'Lo inicia el tag; el panel no lo controla' };
  }
}

export class AwaitRegistryStep implements ReleaseStep {
  readonly key = 'registry' as const;
  constructor(
    private readonly registry: PackageRegistry,
    private readonly settings: ReleaseSettings,
  ) {}
  async execute(ctx: ReleaseContext): Promise<StepOutcome> {
    const { job } = ctx;
    const { pollAttempts, pollIntervalMs } = this.settings;
    for (let i = 1; i <= pollAttempts; i++) {
      if (ctx.signal.aborted) throw new CancelledError('Cancelado');
      ctx.log(`⏳ npm view ${job.library}@${job.to} (intento ${i} de ${pollAttempts})`);
      if (await this.registry.versionExists(job.library, job.to)) {
        ctx.log(`✔ ${job.to} disponible en Artifactory`);
        return { state: 'done', detail: `Encontrada en el intento ${i}` };
      }
      await sleep(pollIntervalMs, ctx.signal);
    }
    const minutes = Math.round((pollAttempts * pollIntervalMs) / 60000);
    throw new StepTimeoutError(
      `La versión no apareció en ${minutes} min. Revisa el pipeline de Jenkins.`,
    );
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new CancelledError('Cancelado'));
      },
      { once: true },
    );
  });
}
