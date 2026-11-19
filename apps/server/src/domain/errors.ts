/** Errores de dominio: la capa HTTP los traduce a códigos de estado. */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION';
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
}

/** Un paso del release no se pudo completar (git, npm, etc.). */
export class StepFailedError extends DomainError {
  readonly code = 'STEP_FAILED';
}

export class CancelledError extends DomainError {
  readonly code = 'CANCELLED';
}
