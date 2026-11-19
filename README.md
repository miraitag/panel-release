# Release Panel

Panel web para versionar las librerías React Native que viven en Bitbucket, empujar el tag que dispara Jenkins (externo), confirmar la publicación en Artifactory y actualizar el **wrapper brownfield** (Callstack) con un PR.

```
Repo (Bitbucket) ──tag──▶ Jenkins (externo) ──publish──▶ Artifactory ──PR──▶ Wrapper brownfield
        ▲                                                     ▲
        └──────────── Release Panel (este proyecto) ──────────┘
```

| Capa      | Tecnología                                                              |
| --------- | ----------------------------------------------------------------------- |
| Monorepo  | pnpm workspaces (`apps/*`, `packages/*`)                                |
| Web       | React 19 + Vite 6 + TypeScript, TanStack Query, Zustand, React Router   |
| API       | Fastify 5 + TypeScript, zod, SSE para la bitácora en vivo               |
| Contratos | `packages/shared` (esquemas zod + reglas SemVer usadas por ambos lados) |
| Calidad   | Vitest, Testing Library, ESLint (con reglas de capas), Prettier         |

## Requisitos

- Node 22+ (`.nvmrc`) y pnpm 10 (`corepack enable`).
- Para el modo real: `git` con acceso SSH a Bitbucket y `npm` en el PATH del servidor.

## Arranque rápido (modo demo, sin credenciales)

```bash
corepack enable
pnpm install
cp .env.example .env          # MOCK_MODE=true por defecto
pnpm dev                      # API en :4310 y web en :5173
```

Abre http://localhost:5173. En modo demo Bitbucket, Artifactory y Jenkins están simulados: puedes generar un release de `auth`, ver la bitácora en vivo y abrir el PR del wrapper.

## Modo real

1. En `.env`: `MOCK_MODE=false` y completa `ARTIFACTORY_*`, `BITBUCKET_*`, `GIT_REMOTE_TEMPLATE`, `TAG_FORMAT`.
2. Configura el `.npmrc` del usuario que corre el servidor para Artifactory (el panel usa `npm view`).
3. Edita `config/libraries.config.json` (lista blanca de paquetes, color y código de línea).
4. Cada librería debe cumplir el contrato de `templates/library/`.

Si falta una variable obligatoria, el servidor no arranca y te dice cuál.

## Scripts

| Comando                                        | Qué hace                                                |
| ---------------------------------------------- | ------------------------------------------------------- |
| `pnpm dev`                                     | API (tsx watch) + web (Vite) en paralelo                |
| `pnpm build`                                   | Compila API (tsup) y web (Vite)                         |
| `pnpm start`                                   | Sirve API y web compilada desde un solo proceso (:4310) |
| `pnpm test`                                    | Tests de shared, server y web                           |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | Calidad                                                 |
| `pnpm check`                                   | typecheck + lint + test                                 |

## Variables de entorno

Ver `.env.example`; cada variable está comentada. Las marcadas **[CONFIRMAR]** dependen de tu infraestructura (Cloud vs Data Center, formato del tag, autenticación de Artifactory).

## Estructura

```
apps/server   API Fastify (Clean Architecture)
apps/web      React + Vite (MVVM)
packages/shared  Contratos zod y SemVer compartidos
config/       Catálogo de librerías
templates/library  Scripts y config que cada librería debe adoptar
docs/ARCHITECTURE.md  Capas, patrones y decisiones
```

Lee `docs/ARCHITECTURE.md` antes de agregar código.
