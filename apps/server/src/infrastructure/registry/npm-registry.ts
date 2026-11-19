import type { PackageRegistry, ProcessRunner } from '../../domain/ports';

/**
 * Adapter de Artifactory usando `npm view`. Así se respeta el .npmrc del
 * servidor (token, scopes) igual que lo haría un desarrollador.
 */
export class NpmViewRegistry implements PackageRegistry {
  constructor(
    private readonly runner: ProcessRunner,
    private readonly registryUrl: string,
    private readonly cwd: string,
  ) {}

  private async view(args: string[]): Promise<unknown> {
    try {
      const r = await this.runner.run(
        'npm',
        ['view', ...args, '--json', '--registry', this.registryUrl],
        {
          cwd: this.cwd,
        },
      );
      return r.stdout.trim() ? JSON.parse(r.stdout) : null;
    } catch {
      return null; // E404: el paquete o la versión no existen
    }
  }

  async latestVersion(pkg: string): Promise<string | null> {
    const tags = (await this.view([pkg, 'dist-tags'])) as { latest?: string } | null;
    return tags?.latest ?? null;
  }

  async versionExists(pkg: string, version: string): Promise<boolean> {
    const v = await this.view([`${pkg}@${version}`, 'version']);
    return v === version;
  }

  async peerDependencies(pkg: string, version: string): Promise<Record<string, string>> {
    const p = await this.view([`${pkg}@${version}`, 'peerDependencies']);
    return (p as Record<string, string> | null) ?? {};
  }
}
