import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { Catalog } from '../domain/catalog';

const HEX = /^#[0-9a-fA-F]{6}$/;

const CatalogSchema = z.object({
  wrapper: z.object({ name: z.string(), repo: z.string().regex(/^[\w.-]+$/) }),
  libraries: z
    .array(
      z.object({
        name: z.string().regex(/^(@[\w.-]+\/)?[\w.-]+$/, 'Nombre de paquete inválido'),
        repo: z.string().regex(/^[\w.-]+$/, 'Nombre de repo inválido'),
        line: z.string().min(1).max(4),
        color: z.string().regex(HEX, 'Color hex de 6 dígitos'),
      }),
    )
    .min(1),
});

export function loadCatalog(path: string): Catalog {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const c = CatalogSchema.parse(raw);
  return new Catalog(
    c.libraries.map((l) => ({
      name: l.name,
      repo: l.repo,
      line: { code: l.line, color: l.color },
    })),
    c.wrapper,
  );
}
