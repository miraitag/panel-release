import { describe, expect, it } from 'vitest';
import type { LibraryState } from '@release-panel/shared';
import { shortName, toLineRow, toNotices } from './libraries.mapper';

const lib = (over: Partial<LibraryState>): LibraryState => ({
  name: '@org/rn-auth',
  repo: 'rn-auth',
  line: { code: 'AU', color: '#0057B8' },
  packageManager: 'npm',
  repoVersion: '5.1.3',
  publishedVersion: '5.1.3',
  wrapperVersion: '5.1.3',
  pendingChangesets: 0,
  suggestedBump: null,
  status: 'up-to-date',
  error: null,
  ...over,
});

describe('libraries.mapper', () => {
  it('acorta el nombre del paquete', () =>
    expect(shortName('@org/rn-design-system')).toBe('design-system'));

  it('marca el tramo al registry como pendiente si hay changesets', () => {
    const row = toLineRow(lib({ pendingChangesets: 2, status: 'pending-publish' }));
    expect(row.reached.registry).toBe(false);
    expect(row.subtitle).toBe('npm, 2 changesets');
    expect(row.action.to).toContain('/release?lib=');
  });

  it('marca el wrapper como no alcanzado cuando está atrasado', () => {
    const row = toLineRow(lib({ wrapperVersion: '5.0.0', status: 'wrapper-outdated' }));
    expect(row.reached).toEqual({ registry: true, wrapper: false });
    expect(row.statusLabel).toBe('Wrapper atrasado');
  });

  it('redacta avisos en lenguaje natural', () => {
    const notices = toNotices([
      lib({ name: '@org/rn-analytics', status: 'wrapper-outdated' }),
      lib({ name: '@org/rn-storage', status: 'wrapper-outdated' }),
    ]);
    expect(notices[0]?.text).toBe('2 líneas no llegan al wrapper: analytics y storage.');
  });
});
