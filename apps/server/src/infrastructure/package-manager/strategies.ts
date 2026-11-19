import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PackageManager } from '@release-panel/shared';
import { StepFailedError } from '../../domain/errors';
import type {
  PackageManagerResolver,
  PackageManagerStrategy,
  ProcessRunner,
  RunOptions,
} from '../../domain/ports';

export class NpmStrategy implements PackageManagerStrategy {
  readonly name = 'npm' as const;
  readonly lockfile = 'package-lock.json';
  constructor(private readonly runner: ProcessRunner) {}
  async install(dir: string, opts: RunOptions) {
    await this.runner.run('npm', ['ci'], { ...opts, cwd: dir });
  }
  runScript(dir: string, script: string, opts: RunOptions) {
    return this.runner.run('npm', ['run', script], { ...opts, cwd: dir });
  }
  async add(dir: string, specs: readonly string[], opts: RunOptions) {
    await this.runner.run('npm', ['install', ...specs], { ...opts, cwd: dir });
  }
}

export class PnpmStrategy implements PackageManagerStrategy {
  readonly name = 'pnpm' as const;
  readonly lockfile = 'pnpm-lock.yaml';
  constructor(private readonly runner: ProcessRunner) {}
  async install(dir: string, opts: RunOptions) {
    await this.runner.run('pnpm', ['install', '--frozen-lockfile'], { ...opts, cwd: dir });
  }
  runScript(dir: string, script: string, opts: RunOptions) {
    return this.runner.run('pnpm', ['run', script], { ...opts, cwd: dir });
  }
  async add(dir: string, specs: readonly string[], opts: RunOptions) {
    await this.runner.run('pnpm', ['add', ...specs], { ...opts, cwd: dir });
  }
}

/** Factory Method: el lockfile decide la estrategia. */
export class LockfilePackageManagerResolver implements PackageManagerResolver {
  constructor(private readonly runner: ProcessRunner) {}

  detectFromFiles(files: readonly string[]): PackageManager | null {
    if (files.includes('pnpm-lock.yaml')) return 'pnpm';
    if (files.includes('package-lock.json')) return 'npm';
    return null;
  }

  async fromDirectory(dir: string): Promise<PackageManagerStrategy> {
    const pm = this.detectFromFiles(
      ['pnpm-lock.yaml', 'package-lock.json'].filter((f) => existsSync(join(dir, f))),
    );
    if (pm === 'pnpm') return new PnpmStrategy(this.runner);
    if (pm === 'npm') return new NpmStrategy(this.runner);
    throw new StepFailedError(`No hay lockfile reconocido en ${dir}`);
  }
}
