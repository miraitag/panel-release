# Arquitectura

## Idea general

Dos aplicaciones y un núcleo compartido:

```
packages/shared  ← contratos (zod) + reglas SemVer. Lo usan server y web.
apps/server      ← Clean Architecture (puertos y adaptadores)
apps/web         ← MVVM sobre React
```

La regla de oro: **las dependencias apuntan hacia adentro**. El dominio no conoce Fastify, `child_process`, React ni HTTP. ESLint lo hace cumplir (`no-restricted-imports` por carpeta).

## Backend · Clean Architecture

```
src/
  domain/            Entidades y reglas puras. Sin I/O.
    release-job.ts     Aggregate root del release (estados y transiciones)
    catalog.ts         Lista blanca de paquetes
    status-policy.ts   Strategy: cómo se decide el estado de una línea
    changeset.ts       Lectura/reescritura de .changeset/*.md
    ports.ts           Interfaces: RepoReader, PackageRegistry, GitPort, ProcessRunner…
    errors.ts          Errores tipados → códigos HTTP
  application/       Casos de uso. Orquestan puertos; no saben de HTTP.
    use-cases/         GetLibrariesStatus, StartRelease, CancelJob, GetWrapperStatus, SyncWrapper…
    release/           ReleasePipeline (Template Method) + pasos (Command) + JobRunner
  infrastructure/    Adaptadores concretos.
    bitbucket/         Cloud y Data Center (mismo puerto, Factory por BITBUCKET_FLAVOR)
    registry/          Artifactory vía `npm view`
    git/               git CLI
    package-manager/   Strategy npm/pnpm + Factory por lockfile
    process/           spawn seguro (shell:false) + SecretMasker
    mock/              Mundo simulado para MOCK_MODE y tests
    runtime.ts         Reloj, IDs, repositorio en memoria, EventBus, workspace en disco
  presentation/http/ Controladores Fastify delgados + SSE
  composition/       Composition Root: el único lugar con `new` de clases concretas
  config/            Validación de variables de entorno (zod, falla rápido)
```

### Flujo de un release

```
POST /api/releases ─▶ StartRelease ─▶ JobRunner.enqueue ─▶ ReleasePipeline.run
                                                               │
  clone ▸ preflight ▸ install ▸ adjust-bump ▸ bump ▸ verify ▸ TAG ▸ jenkins ▸ registry
                                                         ▲ punto de no retorno
cada paso ─▶ ReleaseJob (estado) ─▶ EventBus ─▶ SSE (web) + JSONL (auditoría)
```

- **Antes del tag** cualquier fallo aborta sin efectos.
- **Jenkins** es un paso marcado como `external`: el panel no lo ejecuta.
- **registry** hace polling con `npm view` hasta `POLL_ATTEMPTS`; si no aparece, el job queda en `timeout` ("Revisar Jenkins").
- **Idempotencia:** si la versión ya existe en Artifactory, el preflight termina el job con éxito.
- **Lock:** un solo release activo por librería (409).

## Frontend · MVVM

```
src/
  domain/repositories.ts      Puertos del front (LibrariesRepository, JobsRepository…)
  data/                       Adaptadores HTTP + EventSource; validan respuestas con zod
  di/                         Inyección por Context (fácil de sustituir en tests)
  app/                        Composition root, router, QueryClient, query keys
  presentation/
    design-system/            Tokens "mapa de metro" y componentes sin lógica
    features/<feature>/
      <Feature>View.tsx       View: solo pinta
      use<Feature>ViewModel.ts ViewModel: estado listo para pintar + intenciones
      <feature>.mapper.ts     Funciones puras dominio → modelo de vista (testeables)
      *.store.ts              Estado de UI con Zustand (p. ej. borrador del wizard)
```

Reglas:

- La **View** no importa repositorios ni `fetch`; recibe todo del ViewModel.
- El **ViewModel** usa TanStack Query para datos remotos (caché, reintentos, invalidación) y Zustand solo para estado de UI que debe sobrevivir a la navegación.
- La lógica de presentación (textos, qué tramo va punteado) vive en **mappers puros** con tests.
- La versión que muestra el wizard se calcula con `bumpVersion` de `shared`, igual que en el servidor.

## Patrones usados y dónde

| Patrón                       | Dónde                                               | Por qué                                                       |
| ---------------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| Ports & Adapters             | `domain/ports.ts` + `infrastructure/*`              | Cambiar Bitbucket Cloud↔DC o mock↔real sin tocar casos de uso |
| Composition Root / DI manual | `composition/container.ts`, `web/di`                | Un solo lugar decide implementaciones                         |
| Abstract Factory             | `realAdapters` vs `mockAdapters`                    | Familias coherentes de adaptadores                            |
| Factory Method               | `LockfilePackageManagerResolver`, `createBitbucket` | Elegir implementación por datos (lockfile, flavor)            |
| Strategy                     | `NpmStrategy`/`PnpmStrategy`, `StatusPolicy`        | Variar algoritmo sin `if` dispersos                           |
| Command                      | Cada `ReleaseStep`                                  | Pasos independientes, ordenables y testeables                 |
| Template Method              | `ReleasePipeline.run`                               | Manejo uniforme de estados, eventos, errores y limpieza       |
| Aggregate Root               | `ReleaseJob`                                        | Las transiciones de estado viven en un solo lugar             |
| Observer / Pub-Sub           | `EventBus` → SSE y auditoría JSONL                  | Desacoplar el pipeline de quién escucha                       |
| Repository                   | `JobRepository` (memoria), repos del front          | Persistencia intercambiable                                   |
| Caching Proxy                | `GetLibrariesStatus` (TTL 60 s)                     | No golpear Bitbucket/Artifactory en cada render               |
| Shared Kernel                | `packages/shared`                                   | Contratos y reglas idénticas en ambos lados                   |
| MVVM                         | `apps/web/src/presentation`                         | Vistas tontas, lógica testeable                               |

## Seguridad

- Tokens solo en variables de entorno del servidor; el navegador nunca los ve (proxy de Vite / mismo origen en producción).
- Comandos con `spawn(..., { shell: false })` y argumentos en arreglo.
- Solo paquetes del catálogo (validados con regex en `catalog-loader.ts`).
- `SecretMasker` reemplaza tokens por `***` en logs y SSE.
- `FsWorkspace` rechaza rutas fuera del clon.

## Cómo extender

- **Persistir jobs:** implementa `JobRepository` con SQLite/Postgres y cámbialo en el container.
- **Autenticación:** agrega un hook `onRequest` en Fastify (SSO/LDAP) y usa el usuario en `StartRelease`.
- **Nuevo paso del release:** crea una clase `ReleaseStep`, agrégala al arreglo del pipeline y a `StepKeySchema`.
- **Expo:** el contrato de scripts no cambia; si una librería necesita config nativa, que exponga un config plugin.
