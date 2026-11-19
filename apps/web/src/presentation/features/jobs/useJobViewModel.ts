import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Job } from '@release-panel/shared';
import { queryKeys } from '@/app/query-keys';
import { useRepositories } from '@/di/repositories-context';
import { JOB_STATUS_COPY, jobTitle, toRoute } from './jobs.mapper';

/**
 * ViewModel del recorrido: combina la foto del job (Query) con el stream SSE.
 * Observer: cada evento del servidor actualiza la caché y la bitácora.
 */
export function useJobViewModel(id: string) {
  const { jobs } = useRepositories();
  const qc = useQueryClient();
  const [logs, setLogs] = useState<string[]>([]);
  const [streamLost, setStreamLost] = useState(false);

  const query = useQuery({ queryKey: queryKeys.job(id), queryFn: () => jobs.get(id) });

  useEffect(() => {
    setLogs([]);
    setStreamLost(false);
    const close = jobs.subscribe(
      id,
      (e) => {
        setStreamLost(false);
        if (e.type === 'log') setLogs((prev) => [...prev, e.line]);
        if (e.type === 'job') {
          qc.setQueryData(queryKeys.job(id), e.job);
          // El servidor reenvía la bitácora completa al reconectar.
          if (e.job.status === 'queued' || e.job.status === 'running') return;
          void qc.invalidateQueries({ queryKey: queryKeys.libraries });
          void qc.invalidateQueries({ queryKey: queryKeys.jobs });
        }
        if (e.type === 'step') {
          qc.setQueryData<Job>(queryKeys.job(id), (old) =>
            old
              ? {
                  ...old,
                  steps: old.steps.map((s) =>
                    s.key === e.key
                      ? {
                          ...s,
                          state: e.state,
                          startedAt: e.state === 'running' ? e.ts : s.startedAt,
                          endedAt: e.state === 'running' ? null : e.ts,
                        }
                      : s,
                  ),
                }
              : old,
          );
        }
      },
      () => setStreamLost(true),
    );
    return close;
  }, [id, jobs, qc]);

  const cancel = useMutation({ mutationFn: () => jobs.cancel(id) });

  const job = query.data;
  const route = useMemo(() => (job ? toRoute(job) : []), [job]);
  const waiting = job?.steps.find((s) => s.state === 'running');

  return {
    job,
    title: job ? jobTitle(job) : '',
    status: job ? JOB_STATUS_COPY[job.status] : null,
    isActive: job?.status === 'queued' || job?.status === 'running',
    waitingOn: waiting ? (route.find((r) => r.key === waiting.key)?.title ?? null) : null,
    route,
    logs: logs.join('\n'),
    streamLost,
    isLoading: query.isLoading,
    error: query.error ?? cancel.error,
    cancel: () => cancel.mutate(),
    isCancelling: cancel.isPending,
  };
}

export function useJobsListViewModel() {
  const { jobs } = useRepositories();
  const query = useQuery({
    queryKey: queryKeys.jobs,
    queryFn: () => jobs.list(),
    refetchInterval: 5_000,
  });
  return {
    rows: (query.data ?? []).map((j) => ({
      id: j.id,
      line: j.line,
      title: jobTitle(j),
      tag: j.result?.tag ?? '—',
      createdAt: new Date(j.createdAt).toLocaleString('es-MX', {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
      status: JOB_STATUS_COPY[j.status],
    })),
    isLoading: query.isLoading,
    error: query.error,
  };
}
