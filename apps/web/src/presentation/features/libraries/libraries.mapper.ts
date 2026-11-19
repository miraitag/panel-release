import { compareVersions, type LibraryState, type LibStatus } from '@release-panel/shared';
import type { SignalKind } from '../../design-system/components';

/** Modelo de vista: todo lo que la fila necesita, ya decidido. La vista no calcula nada. */
export interface LineRowModel {
  name: string;
  shortName: string;
  line: LibraryState['line'];
  subtitle: string;
  versions: { repo: string; registry: string; wrapper: string };
  reached: { registry: boolean; wrapper: boolean };
  status: LibStatus;
  statusLabel: string;
  action: { label: string; to: string };
}

const STATUS_LABEL: Record<LibStatus, string> = {
  'up-to-date': 'Al día',
  'pending-publish': 'Cambios sin publicar',
  'wrapper-outdated': 'Wrapper atrasado',
  'major-review': 'Mayor: revisar',
  unknown: 'Sin datos',
};

const ACTION: Record<LibStatus, (name: string) => { label: string; to: string }> = {
  'up-to-date': () => ({ label: 'Ver recorridos', to: '/jobs' }),
  'pending-publish': (name) => ({
    label: 'Generar versión',
    to: `/release?lib=${encodeURIComponent(name)}`,
  }),
  'wrapper-outdated': () => ({ label: 'Actualizar wrapper', to: '/wrapper' }),
  'major-review': () => ({ label: 'Revisar cambios', to: '/wrapper' }),
  unknown: () => ({ label: 'Reintentar', to: '/' }),
};

export function shortName(pkg: string): string {
  return pkg.replace(/^@[^/]+\//, '').replace(/^rn-/, '');
}

export function toLineRow(lib: LibraryState): LineRowModel {
  const pending = lib.pendingChangesets;
  const subtitle = [
    lib.packageManager ?? 'gestor desconocido',
    lib.error
      ? lib.error
      : pending > 0
        ? `${pending} changeset${pending > 1 ? 's' : ''}`
        : 'sin cambios nuevos',
  ].join(', ');
  const registryReached =
    !!lib.repoVersion &&
    !!lib.publishedVersion &&
    pending === 0 &&
    compareVersions(lib.publishedVersion, lib.repoVersion) >= 0;
  const wrapperReached =
    !!lib.publishedVersion &&
    !!lib.wrapperVersion &&
    compareVersions(lib.wrapperVersion, lib.publishedVersion) >= 0;
  return {
    name: lib.name,
    shortName: shortName(lib.name),
    line: lib.line,
    subtitle,
    versions: {
      repo: lib.repoVersion ?? '—',
      registry: lib.publishedVersion ?? 'sin publicar',
      wrapper: lib.wrapperVersion ?? 'no incluida',
    },
    reached: { registry: registryReached, wrapper: wrapperReached },
    status: lib.status,
    statusLabel: STATUS_LABEL[lib.status],
    action: ACTION[lib.status](lib.name),
  };
}

export interface ServiceNotice {
  kind: SignalKind;
  text: string;
}

/** Avisos de servicio: resumen en lenguaje natural del mapa. */
export function toNotices(libs: LibraryState[]): ServiceNotice[] {
  const names = (s: LibStatus) => libs.filter((l) => l.status === s).map((l) => shortName(l.name));
  const list = (xs: string[]) =>
    xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : xs[0];
  const out: ServiceNotice[] = [];
  const behind = names('wrapper-outdated');
  const pending = names('pending-publish');
  const major = names('major-review');
  const unknown = names('unknown');
  if (behind.length)
    out.push({
      kind: 'warn',
      text: `${behind.length === 1 ? 'Una línea no llega' : `${behind.length} líneas no llegan`} al wrapper: ${list(behind)}.`,
    });
  if (pending.length)
    out.push({
      kind: 'info',
      text: `${list(pending)} ${pending.length === 1 ? 'tiene' : 'tienen'} cambios listos para generar versión.`,
    });
  if (major.length)
    out.push({
      kind: 'stop',
      text: `${list(major)}: versión mayor, revísala antes de integrarla.`,
    });
  if (unknown.length) out.push({ kind: 'stop', text: `No se pudo leer: ${list(unknown)}.` });
  if (!out.length) out.push({ kind: 'ok', text: 'Todas las líneas están al día.' });
  return out;
}
