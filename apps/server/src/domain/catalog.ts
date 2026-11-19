import type { Line } from '@release-panel/shared';
import { ValidationError } from './errors';

export interface LibraryDescriptor {
  readonly name: string;
  readonly repo: string;
  readonly line: Line;
}

export interface WrapperDescriptor {
  readonly name: string;
  readonly repo: string;
}

/**
 * Catálogo = lista blanca. Ningún caso de uso opera un paquete que no esté aquí
 * (evita que un nombre arbitrario llegue a un comando de shell).
 */
export class Catalog {
  private readonly byName: Map<string, LibraryDescriptor>;

  constructor(
    readonly libraries: readonly LibraryDescriptor[],
    readonly wrapper: WrapperDescriptor,
  ) {
    this.byName = new Map(libraries.map((l) => [l.name, l]));
  }

  require(name: string): LibraryDescriptor {
    const lib = this.byName.get(name);
    if (!lib) throw new ValidationError(`La librería ${name} no está en el catálogo`);
    return lib;
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }
}
