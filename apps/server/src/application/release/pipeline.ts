import type { StepKey, StepState } from '@release-panel/shared';
import { CancelledError } from '../../domain/errors';
import type { ReleaseJob } from '../../domain/release-job';
import type {
  Clock,
  EventBus,
  JobRepository,
  Logger,
  PackageManagerStrategy,
  Workspace,
} from '../../domain/ports';

/** Estado compartido entre pasos de un mismo release. */
export interface ReleaseContext {
  readonly job: ReleaseJob;
  readonly signal: AbortSignal;
  dir: string | null;
  pm: PackageManagerStrategy | null;
  log(line: string): void;
}

export interface StepOutcome {
  state: Extract<StepState, 'done' | 'skipped' | 'external'>;
  detail?: string;
  /** Termina el release con éxito sin ejecutar los pasos restantes (idempotencia). */
  finishEarly?: boolean;
}

/** Command: cada paso del release es un objeto con una sola responsabilidad. */
export interface ReleaseStep {
  readonly key: StepKey;
  execute(ctx: ReleaseContext): Promise<StepOutcome>;
}

/** El paso no falló, pero se acabó el tiempo de espera (p. ej. Jenkins no publicó). */
export class StepTimeoutError extends Error {}

export interface PipelineDeps {
  jobs: JobRepository;
  events: EventBus;
  clock: Clock;
  workspace: Workspace;
  logger: Logger;
}

/**
 * Template Method / Chain: ejecuta los pasos en orden, centraliza el manejo de
 * estados, eventos y limpieza. Los pasos concretos no saben de SSE ni de persistencia.
 */
export class ReleasePipeline {
  constructor(
    private readonly steps: readonly ReleaseStep[],
    private readonly deps: PipelineDeps,
  ) {}

  async run(job: ReleaseJob, signal: AbortSignal): Promise<void> {
    const { jobs, events, clock } = this.deps;
    const ctx: ReleaseContext = {
      job,
      signal,
      dir: null,
      pm: null,
      log: (line) => {
        const entry = job.log(line, clock.now());
        events.publish(job.id, { type: 'log', ...entry });
      },
    };

    job.start(clock.now());
    await this.emitJob(job);

    try {
      for (const step of this.steps) {
        if (signal.aborted) throw new CancelledError('Cancelado');
        this.setStep(job, step.key, 'running');
        const outcome = await step.execute(ctx);
        this.setStep(job, step.key, outcome.state, outcome.detail);
        await jobs.save(job);
        if (outcome.finishEarly) {
          for (const rest of this.steps) {
            if (job.step(rest.key).state === 'pending') this.setStep(job, rest.key, 'skipped');
          }
          break;
        }
      }
      job.succeed(clock.now());
      ctx.log(`Release ${job.library}@${job.to} completado.`);
    } catch (err) {
      const running = job.toDto().steps.find((s) => s.state === 'running');
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof CancelledError || signal.aborted) {
        job.cancel(clock.now());
        ctx.log('Release cancelado.');
      } else if (err instanceof StepTimeoutError) {
        if (running) this.setStep(job, running.key, 'timeout', message);
        job.timeout(clock.now(), message);
        ctx.log(message);
      } else {
        if (running) this.setStep(job, running.key, 'failed', message);
        job.fail(clock.now(), message);
        ctx.log(`Error: ${message}`);
        this.deps.logger.error('release failed', { jobId: job.id, error: message });
      }
    } finally {
      if (ctx.dir) await this.deps.workspace.dispose(ctx.dir).catch(() => undefined);
      await this.emitJob(job);
    }
  }

  private setStep(job: ReleaseJob, key: StepKey, state: StepState, detail?: string): void {
    const now = this.deps.clock.now();
    job.setStep(key, state, now, detail);
    this.deps.events.publish(job.id, { type: 'step', key, state, ts: now.toISOString() });
  }

  private async emitJob(job: ReleaseJob): Promise<void> {
    await this.deps.jobs.save(job);
    this.deps.events.publish(job.id, { type: 'job', job: job.toDto() });
  }
}
