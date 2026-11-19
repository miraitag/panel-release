import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { bumpVersion, wrapperRange, type Bump, type LibraryState } from '@release-panel/shared';
import { queryKeys } from '@/app/query-keys';
import { useRepositories } from '@/di/repositories-context';
import { shortName } from '../libraries/libraries.mapper';
import { useReleaseDraftStore, type WizardStep } from './release-draft.store';

export const BUMP_HINT: Record<Bump, string> = {
  patch: 'corrección',
  minor: 'algo nuevo',
  major: 'rompe API',
};

export const STEPS: { n: WizardStep; title: string; sub: string }[] = [
  { n: 1, title: 'Librerías', sub: 'qué sale' },
  { n: 2, title: 'Tipo de cambio', sub: 'patch, minor o major' },
  { n: 3, title: 'Validar y tag', sub: 'después actúa Jenkins' },
  { n: 4, title: 'Wrapper', sub: 'rama y PR' },
];

export interface CandidateModel {
  name: string;
  shortName: string;
  line: LibraryState['line'];
  pm: string;
  from: string;
  selected: boolean;
  summary: string;
}

export interface ChosenModel extends CandidateModel {
  bump: Bump;
  to: string;
  range: string;
  changelog: string[];
}

export function useReleaseViewModel() {
  const repos = useRepositories();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const draft = useReleaseDraftStore();

  const libsQuery = useQuery({
    queryKey: queryKeys.libraries,
    queryFn: () => repos.libraries.getAll(),
  });

  // Preselección desde el mapa: /release?lib=@org/rn-auth
  const preselect = params.get('lib');
  const { select, goTo } = draft;
  useEffect(() => {
    if (preselect) {
      select(preselect);
      goTo(2);
    }
  }, [preselect, select, goTo]);

  const candidates: CandidateModel[] = useMemo(
    () =>
      (libsQuery.data?.libraries ?? [])
        .filter((l) => l.repoVersion && l.status !== 'unknown')
        .map((l) => ({
          name: l.name,
          shortName: shortName(l.name),
          line: l.line,
          pm: l.packageManager ?? '?',
          from: l.repoVersion!,
          selected: !!draft.selected[l.name],
          summary:
            l.pendingChangesets > 0
              ? `${l.pendingChangesets} changeset${l.pendingChangesets > 1 ? 's' : ''}, sugerido ${l.suggestedBump}`
              : 'Sin changesets: se creará uno',
        })),
    [libsQuery.data, draft.selected],
  );

  const selected = candidates.filter((c) => c.selected);
  const changesetQueries = useQueries({
    queries: selected.map((c) => ({
      queryKey: queryKeys.changesets(c.name),
      queryFn: () => repos.libraries.getChangesets(c.name),
    })),
  });

  const chosen: ChosenModel[] = selected.map((c, i) => {
    const cs = changesetQueries[i]?.data;
    const bump = draft.bumps[c.name] ?? cs?.suggestedBump ?? 'patch';
    const to = bumpVersion(c.from, bump);
    return {
      ...c,
      bump,
      to,
      range: wrapperRange(to),
      changelog: cs?.changesets.length
        ? cs.changesets.map((x) => `${x.bump}: ${x.summary}`)
        : ['Sin changesets: el panel creará uno con este tipo de cambio.'],
    };
  });

  const commands = chosen
    .map((c) =>
      [
        `# ${c.shortName}`,
        c.pm === 'pnpm' ? 'pnpm install --frozen-lockfile' : 'npm ci',
        `${c.pm} run release:bump`,
        `${c.pm} run release:verify`,
        `${c.pm} run release:tag     # v${c.to}`,
      ].join('\n'),
    )
    .join('\n\n');

  const start = useMutation({
    mutationFn: () =>
      repos.releases.start({ items: chosen.map((c) => ({ name: c.name, bump: c.bump })) }),
    onSuccess: ({ jobIds }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.jobs });
      draft.reset();
      navigate(jobIds.length === 1 ? `/jobs/${jobIds[0]}` : '/jobs');
    },
  });

  const canAdvance = draft.step === 1 ? selected.length > 0 : draft.step < 3;

  return {
    step: draft.step,
    steps: STEPS,
    goTo: draft.goTo,
    next: draft.next,
    back: draft.back,
    canAdvance,
    candidates,
    chosen,
    toggle: draft.toggle,
    setBump: draft.setBump,
    commands: commands || 'Elige al menos una librería.',
    isLoading: libsQuery.isLoading,
    error: libsQuery.error ?? start.error,
    start: () => start.mutate(),
    isStarting: start.isPending,
  };
}
