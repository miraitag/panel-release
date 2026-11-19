import {
  bumpVersion,
  type Job,
  type StartReleaseRequest,
  type StartReleaseResponse,
} from '@release-panel/shared';
import type { Catalog } from '../../domain/catalog';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/errors';
import type { Clock, IdGenerator, JobRepository } from '../../domain/ports';
import { ReleaseJob } from '../../domain/release-job';
import type { JobRunner } from '../release/job-runner';
import { readPackageJson } from './libraries';
import type { RepoReader } from '../../domain/ports';

/** Caso de uso: crea un job por librería y los pone a correr en segundo plano. */
export class StartRelease {
  constructor(
    private readonly catalog: Catalog,
    private readonly reader: RepoReader,
    private readonly jobs: JobRepository,
    private readonly runner: JobRunner,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly onStarted: () => void = () => undefined,
  ) {}

  async execute(req: StartReleaseRequest, user: string): Promise<StartReleaseResponse> {
    const names = req.items.map((i) => i.name);
    if (new Set(names).size !== names.length) throw new ValidationError('Hay librerías repetidas');

    // Validamos todo antes de encolar nada: o salen todas o ninguna.
    const prepared = await Promise.all(
      req.items.map(async (item) => {
        const lib = this.catalog.require(item.name);
        if (await this.jobs.findActiveByLibrary(lib.name)) {
          throw new ConflictError(`Ya hay un release en curso para ${lib.name}`);
        }
        const pkg = await readPackageJson(this.reader, lib.repo);
        if (!pkg?.version) throw new ValidationError(`No se pudo leer la versión de ${lib.name}`);
        return { lib, from: pkg.version, to: bumpVersion(pkg.version, item.bump), bump: item.bump };
      }),
    );

    const jobIds: string[] = [];
    for (const p of prepared) {
      const now = this.clock.now();
      const job = new ReleaseJob({
        id: this.ids.nextJobId(now),
        library: p.lib.name,
        repo: p.lib.repo,
        line: p.lib.line,
        from: p.from,
        to: p.to,
        bump: p.bump,
        createdBy: user,
        now,
      });
      await this.jobs.save(job);
      this.runner.enqueue(job);
      jobIds.push(job.id);
    }
    this.onStarted();
    return { jobIds };
  }
}

export class GetJob {
  constructor(private readonly jobs: JobRepository) {}
  async execute(id: string): Promise<ReleaseJob> {
    const job = await this.jobs.get(id);
    if (!job) throw new NotFoundError(`No existe el job ${id}`);
    return job;
  }
}

export class ListJobs {
  constructor(private readonly jobs: JobRepository) {}
  async execute(): Promise<Job[]> {
    const all = await this.jobs.list();
    return all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((j) => j.toDto());
  }
}

export class CancelJob {
  constructor(
    private readonly jobs: JobRepository,
    private readonly runner: JobRunner,
  ) {}
  async execute(id: string): Promise<void> {
    const job = await this.jobs.get(id);
    if (!job) throw new NotFoundError(`No existe el job ${id}`);
    if (!job.isActive) throw new ConflictError('El job ya terminó');
    this.runner.cancel(id);
  }
}
