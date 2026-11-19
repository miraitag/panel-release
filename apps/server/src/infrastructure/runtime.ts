import { mkdir, readFile, readdir, rm, writeFile, appendFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { JobEvent } from '@release-panel/shared';
import type {
  Clock,
  EventBus,
  IdGenerator,
  JobRepository,
  Logger,
  Workspace,
} from '../domain/ports';
import type { ReleaseJob } from '../domain/release-job';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** REL-YYYY.MM.DD-NN, el formato que muestra la UI. */
export class DailySequenceIds implements IdGenerator {
  private day = '';
  private seq = 0;
  nextJobId(now: Date): string {
    const d = now.toISOString().slice(0, 10).replaceAll('-', '.');
    if (d !== this.day) {
      this.day = d;
      this.seq = 0;
    }
    this.seq++;
    return `REL-${d}-${String(this.seq).padStart(2, '0')}`;
  }
}

/** Repository en memoria. Cambiar a SQLite/Postgres = otra implementación del mismo puerto. */
export class InMemoryJobRepository implements JobRepository {
  private readonly jobs = new Map<string, ReleaseJob>();
  async save(job: ReleaseJob) {
    this.jobs.set(job.id, job);
  }
  async get(id: string) {
    return this.jobs.get(id) ?? null;
  }
  async list() {
    return [...this.jobs.values()];
  }
  async findActiveByLibrary(name: string) {
    return [...this.jobs.values()].find((j) => j.library === name && j.isActive) ?? null;
  }
}

/** Observer en memoria: un canal por job + un canal global. */
export class InMemoryEventBus implements EventBus {
  private readonly byJob = new Map<string, Set<(e: JobEvent) => void>>();
  private readonly all = new Set<(id: string, e: JobEvent) => void>();

  publish(jobId: string, event: JobEvent): void {
    this.byJob.get(jobId)?.forEach((h) => h(event));
    this.all.forEach((h) => h(jobId, event));
  }

  subscribe(jobId: string, handler: (e: JobEvent) => void): () => void {
    const set = this.byJob.get(jobId) ?? new Set();
    set.add(handler);
    this.byJob.set(jobId, set);
    return () => {
      set.delete(handler);
      if (set.size === 0) this.byJob.delete(jobId);
    };
  }

  subscribeAll(handler: (id: string, e: JobEvent) => void): () => void {
    this.all.add(handler);
    return () => this.all.delete(handler);
  }
}

/** Suscriptor de auditoría: un archivo JSONL por job. */
export function attachJsonlAudit(bus: EventBus, dir: string): () => void {
  return bus.subscribeAll((jobId, event) => {
    const file = join(dir, `${jobId}.jsonl`);
    void mkdir(dir, { recursive: true })
      .then(() => appendFile(file, `${JSON.stringify(event)}\n`))
      .catch(() => undefined);
  });
}

/** Clones temporales en WORK_DIR/<jobId>/<repo>. Rechaza rutas que se salgan del clon. */
export class FsWorkspace implements Workspace {
  constructor(private readonly root: string) {}

  private safe(dir: string, rel: string): string {
    const full = resolve(dir, rel);
    if (full !== resolve(dir) && !full.startsWith(resolve(dir) + sep)) {
      throw new Error(`Ruta fuera del clon: ${rel}`);
    }
    return full;
  }

  async create(jobId: string, repo: string): Promise<string> {
    const dir = resolve(this.root, jobId, repo);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    return dir;
  }

  async dispose(dir: string): Promise<void> {
    await rm(dirname(dir), { recursive: true, force: true });
  }

  async readText(dir: string, rel: string): Promise<string | null> {
    try {
      return await readFile(this.safe(dir, rel), 'utf8');
    } catch {
      return null;
    }
  }

  async writeText(dir: string, rel: string, content: string): Promise<void> {
    const full = this.safe(dir, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content, 'utf8');
  }

  async list(dir: string, rel: string): Promise<string[]> {
    try {
      return await readdir(this.safe(dir, rel));
    } catch {
      return [];
    }
  }
}

/** Adapter del logger de Fastify (pino) al puerto Logger. */
export function toLogger(pino: {
  info: (o: object, m: string) => void;
  warn: (o: object, m: string) => void;
  error: (o: object, m: string) => void;
}): Logger {
  return {
    info: (m, d) => pino.info(d ?? {}, m),
    warn: (m, d) => pino.warn(d ?? {}, m),
    error: (m, d) => pino.error(d ?? {}, m),
  };
}
