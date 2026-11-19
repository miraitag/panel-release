import { useMemo } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { createHttpRepositories } from '@/data/repositories/http-repositories';
import type { Repositories } from '@/domain/repositories';
import { RepositoriesProvider } from '@/di/repositories-context';
import { AppShell } from '@/presentation/design-system/components';
import { LibrariesView } from '@/presentation/features/libraries/LibrariesView';
import { ReleaseView } from '@/presentation/features/release/ReleaseView';
import { JobView, JobsListView } from '@/presentation/features/jobs/JobViews';
import { WrapperView } from '@/presentation/features/wrapper/WrapperView';

function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => (await fetch('/api/health')).json() as Promise<{ mock: boolean }>,
    staleTime: Infinity,
  });
}

function Routed() {
  const health = useHealth();
  return (
    <AppShell mock={!!health.data?.mock}>
      <Routes>
        <Route path="/" element={<LibrariesView />} />
        <Route path="/release" element={<ReleaseView />} />
        <Route path="/jobs" element={<JobsListView />} />
        <Route path="/jobs/:id" element={<JobView />} />
        <Route path="/wrapper" element={<WrapperView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

/** Raíz de composición del frontend: aquí se decide qué repositorios se inyectan. */
export function App({ repositories }: { repositories?: Repositories }) {
  const repos = useMemo(() => repositories ?? createHttpRepositories(), [repositories]);
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } },
      }),
    [],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <RepositoriesProvider value={repos}>
        <BrowserRouter>
          <Routed />
        </BrowserRouter>
      </RepositoriesProvider>
    </QueryClientProvider>
  );
}
