import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { wrapperRange, type WrapperDep } from '@release-panel/shared';
import { queryKeys } from '@/app/query-keys';
import { useRepositories } from '@/di/repositories-context';
import { shortName } from '../libraries/libraries.mapper';

export interface WrapperRowModel {
  name: string;
  shortName: string;
  line: WrapperDep['line'];
  current: string;
  target: string;
  meta: string;
  selectable: boolean;
  selected: boolean;
  reachesStation: boolean;
  capsule: string;
  note: string;
  warn: boolean;
}

/** Selección por defecto: lo atrasado, compatible y sin cambio mayor. */
export function defaultSelection(deps: WrapperDep[]): Record<string, boolean> {
  return Object.fromEntries(
    deps.map((d) => [d.name, !d.upToDate && !!d.target && d.compatible && !d.isMajor]),
  );
}

export function useWrapperViewModel() {
  const { wrapper } = useRepositories();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.wrapper, queryFn: () => wrapper.getStatus() });
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [allowMajor, setAllowMajor] = useState(false);

  const deps = query.data?.deps;
  const selection = useMemo(
    () => ({ ...defaultSelection(deps ?? []), ...overrides }),
    [deps, overrides],
  );

  const rows: WrapperRowModel[] = (deps ?? []).map((d) => {
    const selectable = !d.upToDate && !!d.target && d.compatible && (!d.isMajor || allowMajor);
    const selected = selectable && !!selection[d.name];
    return {
      name: d.name,
      shortName: shortName(d.name),
      line: d.line,
      current: d.current ?? 'no incluida',
      target: d.target ?? 'sin publicar',
      meta: `RN ${d.peerReactNative ?? 'sin rango'}`,
      selectable,
      selected,
      reachesStation: d.upToDate || selected,
      capsule: d.upToDate ? 'al día' : selected && d.target ? wrapperRange(d.target) : 'fuera',
      note: d.note ?? (d.upToDate ? 'sin cambios' : selected ? 'entra al PR' : 'no entra'),
      warn: !!d.note,
    };
  });

  const chosen = (deps ?? []).filter(
    (d) => rows.find((r) => r.name === d.name)?.selected && d.target,
  );
  const diff = chosen
    .map(
      (d) =>
        `- "${d.name}": "${d.current ? wrapperRange(d.current) : ''}",\n+ "${d.name}": "${wrapperRange(d.target!)}",`,
    )
    .join('\n');

  const sync = useMutation({
    mutationFn: () =>
      wrapper.sync({
        specs: chosen.map((d) => ({ name: d.name, version: d.target! })),
        allowMajor,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.libraries });
    },
  });

  return {
    info: query.data,
    rows,
    toggle: (name: string) => setOverrides((o) => ({ ...o, [name]: !selection[name] })),
    allowMajor,
    setAllowMajor,
    hasMajors: (deps ?? []).some((d) => d.isMajor && !d.upToDate),
    diff: diff || 'Marca al menos una línea para ver los cambios.',
    canSync: chosen.length > 0 && !sync.isPending,
    sync: () => sync.mutate(),
    isSyncing: sync.isPending,
    result: sync.data,
    isLoading: query.isLoading,
    error: query.error ?? sync.error,
  };
}
