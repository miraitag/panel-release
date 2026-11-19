/**
 * Puertos (Clean Architecture / Hexagonal). El dominio y la aplicación dependen
 * SOLO de estas interfaces; la infraestructura las implementa (Adapter).
 */
import type { JobEvent, PackageManager } from '@release-panel/shared';
import type { ReleaseJob } from './release-job';

/** Lectura de archivos de un repo en la rama principal, sin clonar (API de Bitbucket). */
export interface RepoReader {
  readText(repo: string, path: string): Promise<string | null>;
  listDir(repo: string, path: string): Promise<string[]>;
}

export interface PackageRegistry {
  latestVersion(pkg: string): Promise<string | null>;
  versionExists(pkg: string, version: string): Promise<boolean>;
  peerDependencies(pkg: string, version: string): Promise<Record<string, string>>;
}

export interface RunOptions {
  cwd: string;
  onLine?: (line: string) => void;
  signal?: AbortSignal;
  env?: Record<string, string>;
}

export interface RunResult {
  stdout: string;
  lastLine: string;
}

export interface ProcessRunner {
  run(cmd: string, args: readonly string[], opts: RunOptions): Promise<RunResult>;
}

export interface GitPort {
  clone(repo: string, dir: string, branch: string, opts: RunOptions): Promise<void>;
  currentBranch(dir: string): Promise<string>;
  isClean(dir: string): Promise<boolean>;
  remoteTagExists(dir: string, tag: string): Promise<boolean>;
  checkoutNewBranch(dir: string, branch: string, opts: RunOptions): Promise<void>;
  commit(dir: string, message: string, paths: readonly string[], opts: RunOptions): Promise<string>;
  push(dir: string, branch: string, opts: RunOptions): Promise<void>;
}

/** Strategy por gestor de paquetes. */
export interface PackageManagerStrategy {
  readonly name: PackageManager;
  readonly lockfile: string;
  install(dir: string, opts: RunOptions): Promise<void>;
  runScript(dir: string, script: string, opts: RunOptions): Promise<RunResult>;
  add(dir: string, specs: readonly string[], opts: RunOptions): Promise<void>;
}

/** Factory: elige la estrategia según el lockfile del repo. */
export interface PackageManagerResolver {
  fromDirectory(dir: string): Promise<PackageManagerStrategy>;
  detectFromFiles(files: readonly string[]): PackageManager | null;
}

export interface Workspace {
  create(jobId: string, repo: string): Promise<string>;
  dispose(dir: string): Promise<void>;
  readText(dir: string, rel: string): Promise<string | null>;
  writeText(dir: string, rel: string, content: string): Promise<void>;
  list(dir: string, rel: string): Promise<string[]>;
}

export interface PullRequestGateway {
  open(input: {
    repo: string;
    branch: string;
    target: string;
    title: string;
    description: string;
  }): Promise<{ url: string | null }>;
}

export interface JobRepository {
  save(job: ReleaseJob): Promise<void>;
  get(id: string): Promise<ReleaseJob | null>;
  list(): Promise<ReleaseJob[]>;
  findActiveByLibrary(name: string): Promise<ReleaseJob | null>;
}

/** Observer: los suscriptores (SSE, auditoría) reciben eventos del job. */
export interface EventBus {
  publish(jobId: string, event: JobEvent): void;
  subscribe(jobId: string, handler: (event: JobEvent) => void): () => void;
  subscribeAll(handler: (jobId: string, event: JobEvent) => void): () => void;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  nextJobId(now: Date): string;
}

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}
