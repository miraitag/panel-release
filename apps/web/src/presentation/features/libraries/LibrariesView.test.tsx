import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '@/app/App';
import type { Repositories } from '@/domain/repositories';

/** Gracias a la inyección de repositorios, la vista se prueba sin servidor. */
const fakeRepos: Repositories = {
  libraries: {
    getAll: async () => ({
      checkedAt: new Date().toISOString(),
      libraries: [
        {
          name: '@org/rn-analytics',
          repo: 'rn-analytics',
          line: { code: 'AN', color: '#E87722' },
          packageManager: 'npm',
          repoVersion: '1.9.2',
          publishedVersion: '1.9.2',
          wrapperVersion: '1.7.0',
          pendingChangesets: 0,
          suggestedBump: null,
          status: 'wrapper-outdated',
          error: null,
        },
      ],
    }),
    getChangesets: async (name) => ({ name, changesets: [], suggestedBump: null }),
  },
  releases: { start: async () => ({ jobIds: [] }) },
  jobs: {
    list: async () => [],
    get: async () => {
      throw new Error('no');
    },
    cancel: async () => {},
    subscribe: () => () => {},
  },
  wrapper: {
    getStatus: async () => {
      throw new Error('no');
    },
    sync: async () => {
      throw new Error('no');
    },
  },
};

describe('LibrariesView', () => {
  it('pinta la línea y el aviso de servicio', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true, mock: true }))) as typeof fetch;
    render(<App repositories={fakeRepos} />);
    expect(await screen.findByText('analytics')).toBeTruthy();
    expect(screen.getByText('Una línea no llega al wrapper: analytics.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Actualizar wrapper' })).toBeTruthy();
  });
});
