import type { Bump, Changeset } from '@release-panel/shared';

const FRONTMATTER = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/;
const ENTRY = /^\s*["']?([^"':]+)["']?\s*:\s*(patch|minor|major)\s*$/;

/** Lee un archivo .changeset/*.md y devuelve el bump para `pkg` (si aplica). */
export function parseChangeset(id: string, content: string, pkg: string): Changeset | null {
  const m = FRONTMATTER.exec(content.replace(/\r\n/g, '\n'));
  if (!m) return null;
  const [, head = '', body = ''] = m;
  for (const line of head.split('\n')) {
    const e = ENTRY.exec(line);
    if (e && e[1]?.trim() === pkg) {
      return { id, bump: e[2] as Bump, summary: body.trim() };
    }
  }
  return null;
}

/** Reescribe el bump de `pkg` dentro de un changeset, sin tocar el resumen. */
export function rewriteChangesetBump(content: string, pkg: string, bump: Bump): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(
      new RegExp(`^(\\s*["']?${escapeRegExp(pkg)}["']?\\s*:\\s*)(patch|minor|major)\\s*$`, 'm'),
      `$1${bump}`,
    );
}

export function createChangeset(pkg: string, bump: Bump, summary: string): string {
  return `---\n"${pkg}": ${bump}\n---\n\n${summary}\n`;
}

export function isChangesetFile(file: string): boolean {
  return file.endsWith('.md') && file.toLowerCase() !== 'readme.md';
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
