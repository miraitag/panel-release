import type { Job, JobStatus, StepKey, StepState } from '@release-panel/shared';
import { shortName } from '../libraries/libraries.mapper';

export const STEP_COPY: Record<StepKey, { title: string; cmd: string }> = {
  clone: { title: 'Clonar el repo', cmd: 'git clone --depth 50' },
  preflight: { title: 'Preparación', cmd: 'rama, árbol limpio, versión y tag' },
  install: { title: 'Instalar dependencias', cmd: 'npm ci / pnpm install --frozen-lockfile' },
  'adjust-bump': { title: 'Ajustar changesets', cmd: '.changeset/*.md' },
  bump: { title: 'Generar versión', cmd: '<pm> run release:bump' },
  verify: { title: 'Validar y compilar', cmd: '<pm> run release:verify' },
  tag: { title: 'Subir tag', cmd: '<pm> run release:tag' },
  jenkins: { title: 'Jenkins publica', cmd: 'tramo externo, lo inicia el tag' },
  registry: { title: 'Confirmar en Artifactory', cmd: 'npm view <paquete>@<versión>' },
};

const STATE_COPY: Record<StepState, string> = {
  pending: 'Pendiente',
  running: 'En curso',
  done: 'Listo',
  failed: 'Falló',
  external: 'El panel no lo controla',
  timeout: 'Se acabó el tiempo de espera',
  skipped: 'Omitido',
  cancelled: 'Cancelado',
};

export const JOB_STATUS_COPY: Record<JobStatus, { label: string; color: string }> = {
  queued: { label: 'En cola', color: 'var(--tinta-2)' },
  running: { label: 'En curso', color: 'var(--tinta)' },
  succeeded: { label: 'Completado', color: 'var(--ok)' },
  failed: { label: 'Falló', color: 'var(--alto)' },
  cancelled: { label: 'Cancelado', color: 'var(--gris-senal)' },
  timeout: { label: 'Revisar Jenkins', color: 'var(--aviso)' },
};

export interface RouteStepModel {
  key: StepKey;
  title: string;
  cmd: string;
  stateLabel: string;
  detail: string | null;
  duration: string;
  dot: StepState;
  line: 'done' | 'external' | 'off' | 'none';
}

function duration(start: string | null, end: string | null): string {
  if (!start) return '';
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function toRoute(job: Job): RouteStepModel[] {
  return job.steps.map((s, i) => {
    const next = job.steps[i + 1];
    const line: RouteStepModel['line'] = !next
      ? 'none'
      : s.state === 'external' || next.key === 'jenkins'
        ? s.state === 'done' || s.state === 'external'
          ? 'external'
          : 'off'
        : s.state === 'done' || s.state === 'skipped'
          ? 'done'
          : 'off';
    return {
      key: s.key,
      title: STEP_COPY[s.key].title,
      cmd: STEP_COPY[s.key].cmd,
      stateLabel:
        s.state === 'external'
          ? (s.detail ?? STATE_COPY.external)
          : s.detail
            ? `${STATE_COPY[s.state]}: ${s.detail}`
            : STATE_COPY[s.state],
      detail: s.detail,
      duration: s.state === 'external' ? '' : duration(s.startedAt, s.endedAt),
      dot: s.state,
      line,
    };
  });
}

export function jobTitle(job: Job): string {
  return `${shortName(job.library)} de ${job.from} a ${job.to}`;
}
