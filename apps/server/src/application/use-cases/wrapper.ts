import semver from 'semver';
import {
  compareVersions,
  isMajorJump,
  stripRange,
  wrapperRange,
  type SyncWrapperRequest,
  type SyncWrapperResponse,
  type WrapperDep,
  type WrapperStatus,
} from '@release-panel/shared';
import type { Catalog } from '../../domain/catalog';
import { StepFailedError, ValidationError } from '../../domain/errors';
import type {
  Clock,
  GitPort,
  Logger,
  PackageManagerResolver,
  PackageRegistry,
  PullRequestGateway,
  RepoReader,
  Workspace,
} from '../../domain/ports';
import { readPackageJson } from './libraries';

const BROWNFIELD_PKG = '@callstack/react-native-brownfield';

export class GetWrapperStatus {
  constructor(
    private readonly catalog: Catalog,
    private readonly reader: RepoReader,
    private readonly registry: PackageRegistry,
    private readonly pmResolver: PackageManagerResolver,
  ) {}

  async execute(): Promise<WrapperStatus> {
    const { wrapper } = this.catalog;
    const [pkg, rootFiles] = await Promise.all([
      readPackageJson(this.reader, wrapper.repo),
      this.reader.listDir(wrapper.repo, ''),
    ]);
    const deps = { ...pkg?.devDependencies, ...pkg?.dependencies };
    const rnVersion = stripRange(deps['react-native']);

    const rows: WrapperDep[] = await Promise.all(
      this.catalog.libraries.map(async (lib) => {
        const current = stripRange(deps[lib.name]);
        const target = await this.registry.latestVersion(lib.name);
        const peers = target ? await this.registry.peerDependencies(lib.name, target) : {};
        const peerRn = peers['react-native'] ?? null;
        const compatible = !peerRn || !rnVersion || semver.satisfies(rnVersion, peerRn);
        const upToDate = !!current && !!target && compareVersions(current, target) >= 0;
        const major = !!current && !!target && isMajorJump(current, target);
        const note = !target
          ? 'Sin versión en Artifactory'
          : !compatible
            ? `Requiere react-native ${peerRn}`
            : major
              ? 'Cambio mayor: revisar'
              : !current
                ? 'No está en el wrapper'
                : null;
        return {
          name: lib.name,
          line: lib.line,
          current,
          target,
          peerReactNative: peerRn,
          compatible,
          isMajor: major,
          upToDate,
          note,
        };
      }),
    );

    return {
      repo: wrapper.repo,
      packageManager: this.pmResolver.detectFromFiles(rootFiles),
      reactNativeVersion: rnVersion,
      brownfieldVersion: stripRange(deps[BROWNFIELD_PKG]),
      deps: rows,
    };
  }
}

/** Caso de uso: rama + dependencias nuevas + commit + push + PR en el wrapper. */
export class SyncWrapper {
  constructor(
    private readonly catalog: Catalog,
    private readonly status: GetWrapperStatus,
    private readonly registry: PackageRegistry,
    private readonly workspace: Workspace,
    private readonly git: GitPort,
    private readonly pmResolver: PackageManagerResolver,
    private readonly prs: PullRequestGateway,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly mainBranch: string,
    private readonly onSynced: () => void = () => undefined,
  ) {}

  async execute(req: SyncWrapperRequest): Promise<SyncWrapperResponse> {
    const current = await this.status.execute();
    for (const spec of req.specs) {
      this.catalog.require(spec.name);
      const row = current.deps.find((d) => d.name === spec.name);
      if (!(await this.registry.versionExists(spec.name, spec.version))) {
        throw new ValidationError(`${spec.name}@${spec.version} no existe en Artifactory`);
      }
      if (row && !row.compatible) throw new ValidationError(`${spec.name}: ${row.note}`);
      if (row?.current && isMajorJump(row.current, spec.version) && !req.allowMajor) {
        throw new ValidationError(
          `${spec.name}@${spec.version} es un cambio mayor: confírmalo explícitamente`,
        );
      }
    }

    const specs = req.specs.map((s) => `${s.name}@${wrapperRange(s.version)}`);
    const stamp = this.clock.now().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const branch = `release/libs-${stamp}`;
    const repo = this.catalog.wrapper.repo;
    const dir = await this.workspace.create(`wrapper-${stamp}`, repo);
    const log = (line: string) => this.logger.info(line, { scope: 'wrapper' });
    const opts = { cwd: dir, onLine: log };

    try {
      await this.git.clone(repo, dir, this.mainBranch, opts);
      await this.git.checkoutNewBranch(dir, branch, opts);
      const pm = await this.pmResolver.fromDirectory(dir);
      await pm.add(dir, specs, opts);
      await this.git.commit(
        dir,
        `chore(deps): ${specs.join(', ')}`,
        ['package.json', pm.lockfile],
        opts,
      );
      await this.git.push(dir, branch, opts);
      const pr = await this.prs.open({
        repo,
        branch,
        target: this.mainBranch,
        title: `chore(deps): actualizar ${req.specs.length} librería(s)`,
        description: ['Generado por Release Panel.', '', ...specs.map((s) => `- \`${s}\``)].join(
          '\n',
        ),
      });
      this.onSynced();
      return { branch, pullRequestUrl: pr.url, specs };
    } catch (err) {
      throw new StepFailedError(
        `No se pudo actualizar el wrapper: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      await this.workspace.dispose(dir).catch(() => undefined);
    }
  }
}
