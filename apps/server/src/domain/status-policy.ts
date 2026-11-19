import { compareVersions, isMajorJump, type LibStatus } from '@release-panel/shared';

export interface LibrarySnapshot {
  repoVersion: string | null;
  publishedVersion: string | null;
  wrapperVersion: string | null;
  pendingChangesets: number;
}

/**
 * Strategy: cómo se decide el estado de una línea. Se inyecta para poder
 * cambiar la regla (p. ej. ignorar el wrapper) sin tocar el caso de uso.
 */
export interface StatusPolicy {
  evaluate(s: LibrarySnapshot): LibStatus;
}

export class DefaultStatusPolicy implements StatusPolicy {
  evaluate(s: LibrarySnapshot): LibStatus {
    if (!s.repoVersion) return 'unknown';
    if (s.pendingChangesets > 0) return 'pending-publish';
    if (!s.publishedVersion || compareVersions(s.repoVersion, s.publishedVersion) > 0) {
      return 'pending-publish';
    }
    if (!s.wrapperVersion) return 'wrapper-outdated';
    if (compareVersions(s.publishedVersion, s.wrapperVersion) > 0) {
      return isMajorJump(s.wrapperVersion, s.publishedVersion)
        ? 'major-review'
        : 'wrapper-outdated';
    }
    return 'up-to-date';
  }
}
