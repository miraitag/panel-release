import { ApiErrorSchema } from '@release-panel/shared';
import type { ZodType } from 'zod';

/** Error con el mensaje que devolvió el backend, listo para mostrarse en la UI. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Cliente HTTP mínimo. Valida cada respuesta con zod: si el backend cambia el
 * contrato, el error aparece aquí y no como `undefined` en un componente.
 */
export class ApiClient {
  constructor(private readonly baseUrl = '') {}

  async request<T>(path: string, schema: ZodType<T> | null, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      });
    } catch {
      throw new ApiRequestError(
        0,
        'NETWORK',
        'No hay conexión con el servidor del panel. ¿Está corriendo pnpm dev?',
      );
    }
    const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const parsed = ApiErrorSchema.safeParse(data);
      throw new ApiRequestError(
        res.status,
        parsed.success ? parsed.data.error.code : 'HTTP',
        parsed.success ? parsed.data.error.message : `Error ${res.status}`,
      );
    }
    return schema ? schema.parse(data) : (data as T);
  }

  get<T>(path: string, schema: ZodType<T>) {
    return this.request(path, schema);
  }

  post<T>(path: string, body: unknown, schema: ZodType<T> | null) {
    return this.request(path, schema, { method: 'POST', body: JSON.stringify(body) });
  }

  url(path: string): string {
    return `${this.baseUrl}${path}`;
  }
}
