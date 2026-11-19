/**
 * Capa de dominio del frontend: contratos (puertos) que la presentación consume.
 * La implementación HTTP vive en data/; los tests pueden inyectar fakes.
 */
import type {
  ChangesetsResponse,
  Job,
  JobEvent,
  LibrariesResponse,
  StartReleaseRequest,
  StartReleaseResponse,
  SyncWrapperRequest,
  SyncWrapperResponse,
  WrapperStatus,
} from '@release-panel/shared';

export interface LibrariesRepository {
  getAll(opts?: { refresh?: boolean }): Promise<LibrariesResponse>;
  getChangesets(name: string): Promise<ChangesetsResponse>;
}

export interface ReleasesRepository {
  start(req: StartReleaseRequest): Promise<StartReleaseResponse>;
}

export interface JobsRepository {
  list(): Promise<Job[]>;
  get(id: string): Promise<Job>;
  cancel(id: string): Promise<void>;
  /** Devuelve una función para cerrar la suscripción. */
  subscribe(id: string, onEvent: (e: JobEvent) => void, onError?: () => void): () => void;
}

export interface WrapperRepository {
  getStatus(): Promise<WrapperStatus>;
  sync(req: SyncWrapperRequest): Promise<SyncWrapperResponse>;
}

export interface Repositories {
  libraries: LibrariesRepository;
  releases: ReleasesRepository;
  jobs: JobsRepository;
  wrapper: WrapperRepository;
}
