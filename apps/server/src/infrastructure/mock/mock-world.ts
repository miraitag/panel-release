/**
 * MOCK_MODE: un "mundo" en memoria que simula Bitbucket, Artifactory y Jenkins.
 * Permite recorrer el flujo completo en local sin credenciales.
 * Los datos son de ejemplo (mismos que el diseño).
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { compareVersions, highestBump, bumpVersion, type Bump } from '@release-panel/shared';
import { CancelledError, StepFailedError } from '../../domain/errors';
import { isChangesetFile, parseChangeset } from '../../domain/changeset';
import type {
  GitPort,
  PackageRegistry,
  ProcessRunner,
  PullRequestGateway,
  RepoReader,
  RunOptions,
  RunResult,
} from '../../domain/ports';

type Files = Record<string, string>;

interface Lib {
  repo: string;
  name: string;
  pm: 'npm' | 'pnpm';
  version: string;
  changesets?: { id: string; bump: Bump; summary: string }[];
  peerRn: string;
}

const LIBS: Lib[] = [
  {
    repo: 'rn-design-system',
    name: '@org/rn-design-system',
    pm: 'pnpm',
    version: '3.8.0',
    peerRn: '>=0.76',
  },
  {
    repo: 'rn-auth',
    name: '@org/rn-auth',
    pm: 'npm',
    version: '5.1.3',
    peerRn: '>=0.76',
    changesets: [
      {
        id: 'brave-lions-sing.md',
        bump: 'minor',
        summary: 'Refresco silencioso del token en AuthProvider.',
      },
      { id: 'quiet-owls-jump.md', bump: 'patch', summary: 'Cierre de sesión en Android 14.' },
    ],
  },
  {
    repo: 'rn-networking',
    name: '@org/rn-networking',
    pm: 'pnpm',
    version: '2.5.0',
    peerRn: '>=0.74',
  },
  {
    repo: 'rn-analytics',
    name: '@org/rn-analytics',
    pm: 'npm',
    version: '1.9.2',
    peerRn: '>=0.74',
  },
  {
    repo: 'rn-biometrics',
    name: '@org/rn-biometrics',
    pm: 'pnpm',
    version: '0.11.4',
    peerRn: '>=0.76',
    changesets: [
      { id: 'fresh-cats-dance.md', bump: 'minor', summary: 'Face ID con respaldo por código.' },
    ],
  },
  { repo: 'rn-storage', name: '@org/rn-storage', pm: 'npm', version: '4.0.1', peerRn: '>=0.78' },
];

const WRAPPER_DEPS: Record<string, string> = {
  react: '19.0.0',
  'react-native': '0.79.2',
  '@callstack/react-native-brownfield': '^1.0.0',
  '@org/rn-design-system': '^3.6.1',
  '@org/rn-auth': '^5.1.3',
  '@org/rn-networking': '^2.5.0',
  '@org/rn-analytics': '^1.7.0',
  '@org/rn-biometrics': '~0.11.4',
  '@org/rn-storage': '^3.2.0',
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new CancelledError('Cancelado'));
    });
  });

export class MockWorld {
  readonly repos = new Map<string, Files>();
  readonly published = new Map<string, { versions: string[]; peerRn: string }>();
  readonly tags = new Set<string>();
  /** Repos cuyo `release:verify` falla (para probar el camino de error). */
  readonly failVerify = new Set<string>();
  private prCounter = 318;

  constructor(
    wrapperRepo: string,
    readonly publishDelayMs: number,
  ) {
    for (const l of LIBS) {
      const files: Files = {
        'package.json': JSON.stringify({ name: l.name, version: l.version, scripts: {} }, null, 2),
        [l.pm === 'pnpm' ? 'pnpm-lock.yaml' : 'package-lock.json']: 'lockfileVersion: 9\n',
        '.changeset/config.json': '{}',
      };
      for (const cs of l.changesets ?? []) {
        files[`.changeset/${cs.id}`] = `---\n"${l.name}": ${cs.bump}\n---\n\n${cs.summary}\n`;
      }
      this.repos.set(l.repo, files);
      this.published.set(l.name, { versions: [l.version], peerRn: l.peerRn });
    }
    this.repos.set(wrapperRepo, {
      'package.json': JSON.stringify(
        { name: wrapperRepo, version: '4.12.0', dependencies: WRAPPER_DEPS },
        null,
        2,
      ),
      'pnpm-lock.yaml': 'lockfileVersion: 9\n',
    });
  }

  repoOfPackage(name: string): string | undefined {
    return LIBS.find((l) => l.name === name)?.repo;
  }

  nextPr(): number {
    return ++this.prCounter;
  }

  /** Simula a Jenkins: publica la versión tras un retraso. */
  schedulePublish(name: string, version: string): void {
    setTimeout(() => {
      const entry = this.published.get(name);
      if (entry && !entry.versions.includes(version)) entry.versions.push(version);
    }, this.publishDelayMs);
  }
}

export class MockRepoReader implements RepoReader {
  constructor(private readonly world: MockWorld) {}
  async readText(repo: string, path: string) {
    return this.world.repos.get(repo)?.[path] ?? null;
  }
  async listDir(repo: string, path: string) {
    const files = Object.keys(this.world.repos.get(repo) ?? {});
    const prefix = path ? `${path.replace(/\/$/, '')}/` : '';
    return [
      ...new Set(
        files.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length).split('/')[0]!),
      ),
    ];
  }
}

export class MockRegistry implements PackageRegistry {
  constructor(private readonly world: MockWorld) {}
  async latestVersion(pkg: string) {
    const v = this.world.published.get(pkg)?.versions ?? [];
    return [...v].sort(compareVersions).pop() ?? null;
  }
  async versionExists(pkg: string, version: string) {
    return this.world.published.get(pkg)?.versions.includes(version) ?? false;
  }
  async peerDependencies(pkg: string): Promise<Record<string, string>> {
    const e = this.world.published.get(pkg);
    return e ? { 'react-native': e.peerRn } : {};
  }
}

async function writeFiles(dir: string, files: Files) {
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  }
}

async function readTree(dir: string, base = dir): Promise<Files> {
  const out: Files = {};
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) Object.assign(out, await readTree(full, base));
    else out[relative(base, full)] = await readFile(full, 'utf8');
  }
  return out;
}

export class MockGit implements GitPort {
  constructor(private readonly world: MockWorld) {}
  async clone(repo: string, dir: string, branch: string, opts: RunOptions) {
    opts.onLine?.(
      `$ git clone --depth 50 --branch ${branch} git@bitbucket.org:[WORKSPACE]/${repo}.git .`,
    );
    await sleep(300, opts.signal);
    const files = this.world.repos.get(repo);
    if (!files) throw new StepFailedError(`Repo ${repo} no existe en el mock`);
    await writeFiles(dir, files);
  }
  async currentBranch() {
    return 'main';
  }
  async isClean() {
    return true;
  }
  async remoteTagExists(_dir: string, tag: string) {
    return this.world.tags.has(tag);
  }
  async checkoutNewBranch(_dir: string, branch: string, opts: RunOptions) {
    opts.onLine?.(`$ git checkout -b ${branch}`);
  }
  async commit(_dir: string, message: string, _paths: readonly string[], opts: RunOptions) {
    opts.onLine?.(`$ git commit -m "${message}"`);
    return Math.random().toString(16).slice(2, 9);
  }
  async push(_dir: string, branch: string, opts: RunOptions) {
    opts.onLine?.(`$ git push -u origin ${branch}`);
    await sleep(200, opts.signal);
  }
}

/** Interpreta los scripts del contrato (release:bump, verify, tag, add) sin ejecutar nada real. */
export class MockProcessRunner implements ProcessRunner {
  constructor(private readonly world: MockWorld) {}

  async run(cmd: string, args: readonly string[], opts: RunOptions): Promise<RunResult> {
    const say = async (line: string, ms = 180) => {
      await sleep(ms, opts.signal);
      opts.onLine?.(line);
    };
    await say(`$ ${cmd} ${args.join(' ')}`, 50);
    const repo = basename(opts.cwd);
    const script = args[0] === 'run' ? args[1] : null;

    if ((cmd === 'npm' && args[0] === 'ci') || (cmd === 'pnpm' && args[0] === 'install')) {
      await say('Resolviendo dependencias…', 400);
      await say('added 1182 packages in 41s', 600);
      return { stdout: '', lastLine: '' };
    }
    if (script === 'release:bump') {
      await say('> changeset version');
      const tree = await readTree(opts.cwd);
      const pkg = JSON.parse(tree['package.json'] ?? '{}') as { name: string; version: string };
      const bumps = Object.entries(tree)
        .filter(([f]) => f.startsWith('.changeset/') && isChangesetFile(basename(f)))
        .map(([f, c]) => parseChangeset(basename(f), c, pkg.name)?.bump)
        .filter((b): b is Bump => !!b);
      const bump = highestBump(bumps);
      if (bump) {
        pkg.version = bumpVersion(pkg.version, bump);
        await writeFile(join(opts.cwd, 'package.json'), JSON.stringify(pkg, null, 2));
        for (const f of Object.keys(tree)) {
          if (f.startsWith('.changeset/') && isChangesetFile(basename(f)))
            await rm(join(opts.cwd, f));
        }
      }
      await say(`🦋 All files have been updated (${pkg.version})`);
      return { stdout: '', lastLine: '' };
    }
    if (script === 'release:verify') {
      await say('> lint && typecheck && test && build', 300);
      await say('eslint ok', 400);
      await say('tsc ok', 400);
      if (this.world.failVerify.has(repo)) {
        await say('FAIL src/__tests__/auth.test.ts', 300);
        throw new StepFailedError(`${cmd} run release:verify terminó con código 1`);
      }
      await say('jest 148 pruebas ok', 600);
      await say('bob build: commonjs, module, typescript ok', 500);
      return { stdout: '', lastLine: '' };
    }
    if (script === 'release:tag') {
      const tree = await readTree(opts.cwd);
      const pkg = JSON.parse(tree['package.json'] ?? '{}') as { name: string; version: string };
      const tag = `v${pkg.version}`;
      await say(`git commit -m "chore(release): ${pkg.name}@${pkg.version}"`);
      await say(`git tag ${tag}`);
      await say('git push origin main --follow-tags', 400);
      this.world.tags.add(tag);
      // El push actualiza main en el "Bitbucket" simulado.
      const files: Files = {};
      for (const [f, c] of Object.entries(tree)) if (!f.startsWith('node_modules')) files[f] = c;
      this.world.repos.set(repo, files);
      this.world.schedulePublish(pkg.name, pkg.version);
      const last = JSON.stringify({ name: pkg.name, version: pkg.version, tag, commit: 'a91f3c2' });
      opts.onLine?.(last);
      return { stdout: last, lastLine: last };
    }
    if ((cmd === 'npm' && args[0] === 'install') || (cmd === 'pnpm' && args[0] === 'add')) {
      const pkgPath = join(opts.cwd, 'package.json');
      const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as {
        dependencies: Record<string, string>;
      };
      for (const spec of args.slice(1)) {
        const at = spec.lastIndexOf('@');
        pkg.dependencies[spec.slice(0, at)] = spec.slice(at + 1);
      }
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2));
      await say(`Actualizadas ${args.length - 1} dependencias`, 500);
      return { stdout: '', lastLine: '' };
    }
    await say('(mock) comando sin simulación, se da por bueno');
    return { stdout: '', lastLine: '' };
  }
}

export class MockPullRequests implements PullRequestGateway {
  constructor(private readonly world: MockWorld) {}
  async open(input: { repo: string }) {
    return {
      url: `https://bitbucket.org/[WORKSPACE]/${input.repo}/pull-requests/${this.world.nextPr()}`,
    };
  }
}
