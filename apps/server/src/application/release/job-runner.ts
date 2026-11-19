import { NotFoundError } from '../../domain/errors';
import type { ReleaseJob } from '../../domain/release-job';
import type { ReleasePipeline } from './pipeline';

/**
 * Ejecuta pipelines en segundo plano y guarda un AbortController por job
 * para poder cancelar la espera.
 */
export class JobRunner {
  private readonly controllers = new Map<string, AbortController>();
  private readonly running = new Set<Promise<void>>();

  constructor(private readonly pipeline: ReleasePipeline) {}

  enqueue(job: ReleaseJob): void {
    const ctrl = new AbortController();
    this.controllers.set(job.id, ctrl);
    const p = this.pipeline.run(job, ctrl.signal).finally(() => {
      this.controllers.delete(job.id);
      this.running.delete(p);
    });
    this.running.add(p);
  }

  cancel(jobId: string): void {
    const ctrl = this.controllers.get(jobId);
    if (!ctrl) throw new NotFoundError(`El job ${jobId} no está en ejecución`);
    ctrl.abort();
  }

  /** Útil en tests y en el apagado ordenado del servidor. */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.running]);
  }
}
