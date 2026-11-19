/** Claves de caché centralizadas para invalidar sin errores de tipeo. */
export const queryKeys = {
  libraries: ['libraries'] as const,
  changesets: (name: string) => ['changesets', name] as const,
  jobs: ['jobs'] as const,
  job: (id: string) => ['jobs', id] as const,
  wrapper: ['wrapper'] as const,
};
