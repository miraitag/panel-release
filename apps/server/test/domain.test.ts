import { describe, expect, it } from 'vitest';
import { createChangeset, parseChangeset, rewriteChangesetBump } from '../src/domain/changeset';
import { DefaultStatusPolicy } from '../src/domain/status-policy';
import { ReleaseJob } from '../src/domain/release-job';

describe('DefaultStatusPolicy', () => {
  const p = new DefaultStatusPolicy();
  const base = {
    repoVersion: '1.0.0',
    publishedVersion: '1.0.0',
    wrapperVersion: '1.0.0',
    pendingChangesets: 0,
  };

  it('al día cuando todo coincide', () => expect(p.evaluate(base)).toBe('up-to-date'));
  it('pendiente si hay changesets', () =>
    expect(p.evaluate({ ...base, pendingChangesets: 1 })).toBe('pending-publish'));
  it('wrapper atrasado en minor', () =>
    expect(p.evaluate({ ...base, repoVersion: '1.2.0', publishedVersion: '1.2.0' })).toBe(
      'wrapper-outdated',
    ));
  it('revisión en major', () =>
    expect(p.evaluate({ ...base, repoVersion: '2.0.0', publishedVersion: '2.0.0' })).toBe(
      'major-review',
    ));
  it('desconocido sin versión de repo', () =>
    expect(p.evaluate({ ...base, repoVersion: null })).toBe('unknown'));
});

describe('changesets', () => {
  const md = createChangeset('@org/rn-auth', 'minor', 'Algo nuevo');
  it('lee el bump del paquete', () =>
    expect(parseChangeset('a.md', md, '@org/rn-auth')?.bump).toBe('minor'));
  it('ignora otros paquetes', () => expect(parseChangeset('a.md', md, '@org/otro')).toBeNull());
  it('reescribe el bump', () =>
    expect(
      parseChangeset('a.md', rewriteChangesetBump(md, '@org/rn-auth', 'major'), '@org/rn-auth')
        ?.bump,
    ).toBe('major'));
});

describe('ReleaseJob', () => {
  it('cancela los pasos pendientes', () => {
    const job = new ReleaseJob({
      id: 'REL-1',
      library: 'x',
      repo: 'x',
      line: { code: 'X', color: '#000000' },
      from: '1.0.0',
      to: '1.1.0',
      bump: 'minor',
      createdBy: 't',
      now: new Date(),
    });
    job.cancel(new Date());
    expect(job.status).toBe('cancelled');
    expect(job.toDto().steps.every((s) => s.state === 'cancelled')).toBe(true);
  });
});
