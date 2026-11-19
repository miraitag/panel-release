import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/app/query-keys';
import { useRepositories } from '@/di/repositories-context';
import { toLineRow, toNotices } from './libraries.mapper';

/**
 * ViewModel (MVVM): expone estado listo para pintar e intenciones (`refresh`).
 * La vista no conoce repositorios, caché ni reglas de negocio.
 */
export function useLibrariesViewModel() {
  const { libraries } = useRepositories();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.libraries,
    queryFn: () => libraries.getAll(),
    refetchInterval: 60_000,
  });

  const refresh = useMutation({
    mutationFn: () => libraries.getAll({ refresh: true }),
    onSuccess: (data) => qc.setQueryData(queryKeys.libraries, data),
  });

  const rows = useMemo(() => (query.data?.libraries ?? []).map(toLineRow), [query.data]);
  const notices = useMemo(() => toNotices(query.data?.libraries ?? []), [query.data]);
  const checkedAt = query.data ? new Date(query.data.checkedAt) : null;

  return {
    rows,
    notices,
    checkedAtLabel: checkedAt
      ? checkedAt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
      : null,
    isLoading: query.isLoading,
    error: query.error ?? refresh.error,
    isRefreshing: refresh.isPending,
    refresh: () => refresh.mutate(),
    retry: () => void query.refetch(),
  };
}
