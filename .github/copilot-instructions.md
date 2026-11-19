# Instrucciones para GitHub Copilot · Release Panel

Lee `docs/ARCHITECTURE.md` antes de proponer cambios. Resumen de reglas obligatorias:

## Stack (no cambiar sin pedirlo)

- pnpm workspaces, Node 22, TypeScript estricto.
- Web: React 19 + Vite 6, TanStack Query (datos remotos), Zustand (estado de UI), React Router.
- API: Fastify 5, zod. Sin Express, sin NestJS.
- Tests: Vitest (+ Testing Library en web).

## Backend (apps/server) · Clean Architecture

- `domain/` no importa nada de `application/`, `infrastructure/`, `presentation/`, `fastify` ni `node:*`.
- `application/` solo depende de `domain/` y `@release-panel/shared`.
- Todo I/O nuevo = un puerto en `domain/ports.ts` + un adaptador en `infrastructure/` + su versión mock en `infrastructure/mock/`.
- Solo `composition/container.ts` instancia clases concretas.
- Comandos externos SIEMPRE con `ProcessRunner` (spawn, `shell:false`, argumentos en arreglo). Nunca `exec` con strings.
- El panel no invoca Jenkins. Las acciones sobre un repo pasan por scripts de su `package.json` (`release:*`).
- Errores de negocio: lanzar subclases de `DomainError`; la capa HTTP los traduce.

## Frontend (apps/web) · MVVM

- View (`*View.tsx`): solo JSX y llamadas a intenciones del ViewModel. Sin `fetch`, sin repositorios.
- ViewModel (`use*ViewModel.ts`): TanStack Query + mappers; devuelve datos listos para pintar.
- Lógica de presentación en `*.mapper.ts` (funciones puras con test).
- Contratos y SemVer: importar de `@release-panel/shared`, nunca duplicar.
- Estilo visual "mapa de metro": usar clases de `design-system/metro.css` y componentes de `design-system/components.tsx`. Colores de línea vienen del catálogo, no se hardcodean.

## Textos de UI

- Español, frases cortas, en minúsculas tipo oración; sin etiquetas en MAYÚSCULAS.
- Los botones dicen exactamente lo que hacen ("Crear rama y PR", "Subir tag").
- Los errores explican qué pasó y qué hacer.

## Antes de terminar

Ejecuta `pnpm check` (typecheck + lint + test). Agrega tests para casos de uso, pasos del pipeline y mappers nuevos.
