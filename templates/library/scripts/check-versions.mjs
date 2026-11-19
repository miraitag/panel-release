#!/usr/bin/env node
// release:check — compara la versión del repo con la publicada y cuenta changesets.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const registry = pkg.publishConfig?.registry;
let published = null;
try {
  const args = [
    'view',
    pkg.name,
    'dist-tags',
    '--json',
    ...(registry ? ['--registry', registry] : []),
  ];
  published = JSON.parse(execFileSync('npm', args).toString()).latest ?? null;
} catch {
  /* nunca publicada */
}
const pending = existsSync('.changeset')
  ? readdirSync('.changeset').filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
      .length
  : 0;
console.log(
  JSON.stringify({
    name: pkg.name,
    repoVersion: pkg.version,
    published,
    pendingChangesets: pending,
  }),
);
