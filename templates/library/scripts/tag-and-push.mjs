#!/usr/bin/env node
// release:tag — commit de release + tag anotado + push. El tag dispara Jenkins.
// La ÚLTIMA línea de salida es JSON: el Release Panel la lee para mostrar tag y commit.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const sh = (cmd, args) => execFileSync(cmd, args, { stdio: 'pipe' }).toString().trim();
const { name, version } = JSON.parse(readFileSync('package.json', 'utf8'));
// Debe coincidir con TAG_FORMAT del panel y con lo que escucha Jenkins.
const tag = `v${version}`;

if (sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']) !== 'main')
  throw new Error('Solo se publica desde main');
if (sh('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]))
  throw new Error(`El tag ${tag} ya existe en origin`);

sh('git', ['add', '-A']);
sh('git', ['commit', '-m', `chore(release): ${name}@${version}`]);
sh('git', ['tag', '-a', tag, '-m', `${name}@${version}`]);
sh('git', ['push', 'origin', 'main', '--follow-tags']);

console.log(
  JSON.stringify({ name, version, tag, commit: sh('git', ['rev-parse', '--short', 'HEAD']) }),
);
