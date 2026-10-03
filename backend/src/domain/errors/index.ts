/**
 * EnergyMatrix EMS - erros de dominio.
 *
 * Padrao unico de resposta (secao 8 do documento):
 *   { "error": { "code": "MACHINE_NOT_FOUND", "message": "..." } }
 *
 * Os erros de dominio nao conhecem HTTP, Express nem PostgreSQL.
 */

export const ERROR_CODES = {
  APP_ERROR: "APP_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  MACHINE_NOT_FOUND: "MACHINE_NOT_FOUND",
  ALERT_NOT_FOUND: "ALERT_NOT_FOUND",
  PROTOCOL_NOT_FOUND: "PROTOCOL_NOT_FOUND",
  EVENT_NOT_FOUND: "EVENT_NOT_FOUND",
  RELATIONSHIP_NOT_FOUND: "RELATIONSHIP_NOT_FOUND",
  IMPACT_NOT_FOUND: "IMPACT_NOT_FOUND",
  USER_NOT_FOUND: "USER_NOT_FOUND",
  INVITE_NOT_FOUND: "INVITE_NOT_FOUND",
  CONFLICT: "CONFLICT",
  MACHINE_ALREADY_EXISTS: "MACHINE_ALREADY_EXISTS",
  EMAIL_ALREADY_EXISTS: "EMAIL_ALREADY_EXISTS",
  RELATIONSHIP_ALREADY_EXISTS: "RELATIONSHIP_ALREADY_EXISTS",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  UNAUTHORIZED: "UNAUTHORIZED",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_INVALID: "TOKEN_INVALID",
  FORBIDDEN: "FORBIDDEN",
  INVITE_INVALID: "INVITE_INVALID",
  SELF_RELATION_NOT_ALLOWED: "SELF_RELATION_NOT_ALLOWED",
  CYCLE_NOT_ALLOWED: "CYCLE_NOT_ALLOWED",
  DATABASE_ERROR: "DATABASE_ERROR",
  DATABASE_UNAVAILABLE: "DATABASE_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export type ErrorDetails = Readonly<Record<string, unknown>>

/** Base de todos os erros previstos (mapeados pelo errorHandler central). */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: ErrorDetails

  constructor(code: ErrorCode, message: string, status = 500, details?: ErrorDetails) {
    super(message)
    this.name = new.target.name
    this.code = code
    this.status = status
    if (details) this.details = details
    Error.captureStackTrace?.(this, new.target)
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(ERROR_CODES.VALIDATION_ERROR, message, 400, details)
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, code: ErrorCode = ERROR_CODES.NOT_FOUND, details?: ErrorDetails) {
    super(code, message, 404, details)
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: ErrorCode = ERROR_CODES.CONFLICT, details?: ErrorDetails) {
    super(code, message, 409, details)
  }
}

/** 401 - token ausente, invalido, expirado ou credencial errada. */
export class UnauthorizedError extends AppError {
  constructor(message: string, code: ErrorCode = ERROR_CODES.UNAUTHORIZED, details?: ErrorDetails) {
    super(code, message, 401, details)
  }
}

/**
 * 403 - autenticado, porem sem permissao (RBAC). O isolamento entre tenants
 * NUNCA usa 403: um id de outro tenant responde 404 (secao 7.1.3).
 */
export class ForbiddenError extends AppError {
  constructor(message: string, code: ErrorCode = ERROR_CODES.FORBIDDEN, details?: ErrorDetails) {
    super(code, message, 403, details)
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(ERROR_CODES.DATABASE_ERROR, message, 500, details)
  }
}

export class NotImplementedError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(ERROR_CODES.NOT_IMPLEMENTED, message, 501, details)
  }
}

/** 429 - rate limiting (tentativas de login/convite, secao 7.2). */
export class RateLimitError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(ERROR_CODES.RATE_LIMITED, message, 429, details)
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export interface ErrorBody {
  error: { code: ErrorCode | string; message: string; details?: ErrorDetails }
}

/** Corpo de erro canonico (usado por controllers e middleware). */
export function toErrorBody(error: unknown): ErrorBody {
  if (isAppError(error)) {
    return error.details
      ? { error: { code: error.code, message: error.message, details: error.details } }
      : { error: { code: error.code, message: error.message } }
  }
  const message = error instanceof Error ? error.message : "Erro interno do servidor"
  return { error: { code: ERROR_CODES.INTERNAL_ERROR, message } }
}

export function statusOf(error: unknown): number {
  if (isAppError(error)) return error.status
  return 500
}