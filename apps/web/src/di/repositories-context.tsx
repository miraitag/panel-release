import { createContext, useContext, type ReactNode } from 'react';
import type { Repositories } from '@/domain/repositories';

/** Inyección de dependencias por Context: la vista no sabe si habla con HTTP o con un fake. */
const RepositoriesContext = createContext<Repositories | null>(null);

export function RepositoriesProvider({
  value,
  children,
}: {
  value: Repositories;
  children: ReactNode;
}) {
  return <RepositoriesContext.Provider value={value}>{children}</RepositoriesContext.Provider>;
}

export function useRepositories(): Repositories {
  const ctx = useContext(RepositoriesContext);
  if (!ctx) throw new Error('useRepositories debe usarse dentro de <RepositoriesProvider>');
  return ctx;
}
