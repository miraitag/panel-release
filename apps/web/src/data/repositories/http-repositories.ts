import {
  ChangesetsResponseSchema,
  JobEventSchema,
  JobListResponseSchema,
  JobSchema,
  LibrariesResponseSchema,
  StartReleaseResponseSchema,
  SyncWrapperResponseSchema,
  WrapperStatusSchema,
} from '@release-panel/shared';
import type { Repositories } from '@/domain/repositories';
import { ApiClient } from '../http/api-client';

/** Adapters HTTP de los repositorios del dominio. */
export function createHttpRepositories(api = new ApiClient()): Repositories {
  return {
    libraries: {
      getAll: (opts) =>
        api.get(`/api/libraries${opts?.refresh ? '?refresh=true' : ''}`, LibrariesResponseSchema),
      getChangesets: (name) =>
        api.get(`/api/libraries/${encodeURIComponent(name)}/changesets`, ChangesetsResponseSchema),
    },
    releases: {
      start: (req) => api.post('/api/releases', req, StartReleaseResponseSchema),
    },
    jobs: {
      list: async () => (await api.get('/api/jobs', JobListResponseSchema)).jobs,
      get: (id) => api.get(`/api/jobs/${id}`, JobSchema),
      cancel: async (id) => {
        await api.post(`/api/jobs/${id}/cancel`, {}, null);
      },
      subscribe: (id, onEvent, onError) => {
        const source = new EventSource(api.url(`/api/jobs/${id}/stream`));
        source.onmessage = (msg) => {
          const parsed = JobEventSchema.safeParse(JSON.parse(msg.data as string));
          if (parsed.success) onEvent(parsed.data);
        };
        source.onerror = () => onError?.();
        return () => source.close();
      },
    },
    wrapper: {
      getStatus: () => api.get('/api/wrapper', WrapperStatusSchema),
      sync: (req) => api.post('/api/wrapper/sync', req, SyncWrapperResponseSchema),
    },
  };
}
