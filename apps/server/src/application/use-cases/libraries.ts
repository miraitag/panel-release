import {
  highestBump,
  stripRange,
  type ChangesetsResponse,
  type LibrariesResponse,
  type LibraryState,
} from '@release-panel/shared';
import type { Catalog, LibraryDescriptor } from '../../domain/catalog';
import { isChangesetFile, parseChangeset } from '../../domain/changeset';
import type {
  Clock,
  PackageManagerResolver,
  PackageRegistry,
  RepoReader,
} from '../../domain/ports';
import type { StatusPolicy } from '../../domain/status-policy';

interface PackageJson {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export async function readPackageJson(
  reader: RepoReader,
  repo: string,
): Promise<PackageJson | null> {
  const raw = await reader.readText(repo, 'package.json');
  return raw ? (JSON.parse(raw) as PackageJson) : null;
}

/** Caso de uso: lee las changesets pendientes de una librería en main. */
export class GetChangesets {
  constructor(
    private readonly catalog: Catalog,
    private readonly reader: RepoReader,
  ) {}

  async execute(name: string): Promise<ChangesetsResponse> {
    const lib = this.catalog.require(name);
    const files = (await this.reader.listDir(lib.repo, '.changeset')).filter(isChangesetFile);
    const changesets = (
      await Promise.all(
        files.map(async (f) => {
          const content = await this.reader.readText(lib.repo, `.changeset/${f}`);
          return content ? parseChangeset(f, content, lib.name) : null;
        }),
      )
    ).filter((c): c is NonNullable<typeof c> => c !== null);
    return { name, changesets, suggestedBump: highestBump(changesets.map((c) => c.bump)) };
  }
}

/**
 * Caso de uso del mapa: combina repo (Bitbucket), Artifactory y wrapper.
 * Usa una caché corta (Proxy/caching) para no golpear las APIs en cada render.
 */
export class GetLibrariesStatus {
  private cache: { at: number; value: LibrariesResponse } | null = null;

  constructor(
    private readonly catalog: Catalog,
    private readonly reader: RepoReader,
    private readonly registry: PackageRegistry,
    private readonly pmResolver: PackageManagerResolver,
    private readonly changesets: GetChangesets,
    private readonly policy: StatusPolicy,
    private readonly clock: Clock,
    private readonly ttlMs = 60_000,
  ) {}

  async execute(opts: { refresh?: boolean } = {}): Promise<LibrariesResponse> {
    const now = this.clock.now().getTime();
    if (!opts.refresh && this.cache && now - this.cache.at < this.ttlMs) return this.cache.value;

    const wrapperPkg = await readPackageJson(this.reader, this.catalog.wrapper.repo).catch(
      () => null,
    );
    const wrapperDeps = { ...wrapperPkg?.devDependencies, ...wrapperPkg?.dependencies };
    const libraries = await Promise.all(
      this.catalog.libraries.map((lib) => this.snapshot(lib, wrapperDeps[lib.name] ?? null)),
    );
    const value = { checkedAt: this.clock.now().toISOString(), libraries };
    this.cache = { at: now, value };
    return value;
  }

  invalidate(): void {
    this.cache = null;
  }

  private async snapshot(
    lib: LibraryDescriptor,
    wrapperRangeValue: string | null,
  ): Promise<LibraryState> {
    const base: LibraryState = {
      name: lib.name,
      repo: lib.repo,
      line: lib.line,
      packageManager: null,
      repoVersion: null,
      publishedVersion: null,
      wrapperVersion: stripRange(wrapperRangeValue),
      pendingChangesets: 0,
      suggestedBump: null,
      status: 'unknown',
      error: null,
    };
    try {
      const [pkg, published, cs, rootFiles] = await Promise.all([
        readPackageJson(this.reader, lib.repo),
        this.registry.latestVersion(lib.name),
        this.changesets.execute(lib.name),
        this.reader.listDir(lib.repo, ''),
      ]);
      const state: LibraryState = {
        ...base,
        packageManager: this.pmResolver.detectFromFiles(rootFiles),
        repoVersion: pkg?.version ?? null,
        publishedVersion: published,
        pendingChangesets: cs.changesets.length,
        suggestedBump: cs.suggestedBump,
      };
      return { ...state, status: this.policy.evaluate(state) };
    } catch (err) {
      return { ...base, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
