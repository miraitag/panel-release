/**
 * Reglas SemVer compartidas. La UI y el servidor usan EXACTAMENTE estas funciones,
 * así la versión que muestra el wizard es la misma que se genera.
 */
import type { Bump } from './contracts';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/;

export function parseVersion(v: string): [number, number, number] | null {
  const m = SEMVER.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function bumpVersion(version: string, bump: Bump): string {
  const p = parseVersion(version);
  if (!p) throw new Error(`Versión inválida: ${version}`);
  const [maj, min, pat] = p;
  if (bump === 'major') return `${maj + 1}.0.0`;
  if (bump === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

/** 0.x → "~" (un minor puede romper); ≥1 → "^". */
export function wrapperRange(version: string): string {
  return `${version.startsWith('0.') ? '~' : '^'}${version}`;
}

export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

export function isMajorJump(from: string, to: string): boolean {
  const a = parseVersion(from);
  const b = parseVersion(to);
  if (!a || !b) return false;
  if (a[0] === 0 && b[0] === 0) return b[1] > a[1]; // en 0.x el minor rompe
  return b[0] > a[0];
}

/** Toma el bump más alto de una lista de changesets. */
export function highestBump(bumps: Bump[]): Bump | null {
  if (bumps.includes('major')) return 'major';
  if (bumps.includes('minor')) return 'minor';
  if (bumps.includes('patch')) return 'patch';
  return null;
}

/** Quita ^ o ~ de un rango simple de package.json. */
export function stripRange(range: string | null | undefined): string | null {
  if (!range) return null;
  const m = /(\d+\.\d+\.\d+)/.exec(range);
  return m?.[1] ?? null;
}
