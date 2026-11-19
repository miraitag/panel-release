import type {
  Bump,
  Job,
  JobStatus,
  JobStep,
  Line,
  StepKey,
  StepState,
} from '@release-panel/shared';

export const RELEASE_STEPS: readonly StepKey[] = [
  'clone',
  'preflight',
  'install',
  'adjust-bump',
  'bump',
  'verify',
  'tag',
  'jenkins',
  'registry',
];

/** Desde aquí no hay vuelta atrás: el tag ya está en Bitbucket. */
export const POINT_OF_NO_RETURN: StepKey = 'tag';

const MAX_LOG_LINES = 5000;

export interface NewJobProps {
  id: string;
  library: string;
  repo: string;
  line: Line;
  from: string;
  to: string;
  bump: Bump;
  createdBy: string;
  now: Date;
}

/**
 * Aggregate root del release. Toda transición de estado pasa por aquí, así las
 * reglas (orden de pasos, estados finales) viven en un solo lugar.
 */
export class ReleaseJob {
  readonly id: string;
  readonly library: string;
  readonly repo: string;
  readonly line: Line;
  readonly from: string;
  readonly to: string;
  readonly bump: Bump;
  readonly createdBy: string;
  readonly createdAt: Date;
  private _status: JobStatus = 'queued';
  private _finishedAt: Date | null = null;
  private _error: string | null = null;
  private _result: { tag?: string; commit?: string } | null = null;
  private readonly _steps: JobStep[];
  private readonly _logs: { line: string; ts: string }[] = [];

  constructor(p: NewJobProps) {
    this.id = p.id;
    this.library = p.library;
    this.repo = p.repo;
    this.line = p.line;
    this.from = p.from;
    this.to = p.to;
    this.bump = p.bump;
    this.createdBy = p.createdBy;
    this.createdAt = p.now;
    this._steps = RELEASE_STEPS.map((key) => ({
      key,
      state: 'pending' as StepState,
      startedAt: null,
      endedAt: null,
      detail: null,
    }));
  }

  get status(): JobStatus {
    return this._status;
  }

  get isActive(): boolean {
    return this._status === 'queued' || this._status === 'running';
  }

  get logs(): readonly { line: string; ts: string }[] {
    return this._logs;
  }

  get pastPointOfNoReturn(): boolean {
    return this.step(POINT_OF_NO_RETURN).state === 'done';
  }

  step(key: StepKey): JobStep {
    const s = this._steps.find((x) => x.key === key);
    if (!s) throw new Error(`Paso desconocido: ${key}`);
    return s;
  }

  start(now: Date): void {
    this._status = 'running';
    void now;
  }

  log(line: string, now: Date): { line: string; ts: string } {
    const entry = { line, ts: now.toISOString() };
    this._logs.push(entry);
    if (this._logs.length > MAX_LOG_LINES) this._logs.shift();
    return entry;
  }

  setStep(key: StepKey, state: StepState, now: Date, detail?: string): void {
    const s = this.step(key);
    if (state === 'running') s.startedAt = now.toISOString();
    if (state !== 'running' && state !== 'pending') s.endedAt = now.toISOString();
    s.state = state;
    if (detail !== undefined) s.detail = detail;
  }

  setResult(result: { tag?: string; commit?: string }): void {
    this._result = { ...this._result, ...result };
  }

  succeed(now: Date): void {
    this.finish('succeeded', now, null);
  }

  fail(now: Date, error: string): void {
    this.finish('failed', now, error);
  }

  timeout(now: Date, error: string): void {
    this.finish('timeout', now, error);
  }

  cancel(now: Date): void {
    for (const s of this._steps)
      if (s.state === 'pending' || s.state === 'running') s.state = 'cancelled';
    this.finish('cancelled', now, 'Cancelado por el usuario');
  }

  private finish(status: JobStatus, now: Date, error: string | null): void {
    this._status = status;
    this._finishedAt = now;
    this._error = error;
  }

  toDto(): Job {
    return {
      id: this.id,
      library: this.library,
      line: this.line,
      from: this.from,
      to: this.to,
      bump: this.bump,
      status: this._status,
      steps: this._steps.map((s) => ({ ...s })),
      createdBy: this.createdBy,
      createdAt: this.createdAt.toISOString(),
      finishedAt: this._finishedAt?.toISOString() ?? null,
      result: this._result,
      error: this._error,
    };
  }
}
