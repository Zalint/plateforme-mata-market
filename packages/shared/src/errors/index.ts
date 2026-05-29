/**
 * Hiérarchie d'erreurs métier partagée entre `apps/api` et `apps/web`.
 *
 * Règle CLAUDE.md §G2 : « Aucun `throw new Error()` générique ». Toutes les
 * erreurs métier passent par ces classes. Les routes Fastify les mappent
 * vers leur statut HTTP via `error-handler`.
 */

export type DomainErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'RATE_LIMITED'
  | 'EXTERNAL_FAILURE'
  | 'INTERNAL';

export class DomainError extends Error {
  public override readonly name = 'DomainError';
  public readonly code: DomainErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: DomainErrorCode,
    message: string,
    options?: { statusCode?: number; details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.code = code;
    this.statusCode = options?.statusCode ?? defaultStatusFor(code);
    this.details = options?.details;
  }
}

function defaultStatusFor(code: DomainErrorCode): number {
  switch (code) {
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
      return 409;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'VALIDATION':
      return 422;
    case 'RATE_LIMITED':
      return 429;
    case 'EXTERNAL_FAILURE':
      return 502;
    case 'INTERNAL':
      return 500;
  }
}
