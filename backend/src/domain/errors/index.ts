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
  CONFLICT: "CONFLICT",
  MACHINE_ALREADY_EXISTS: "MACHINE_ALREADY_EXISTS",
  DATABASE_ERROR: "DATABASE_ERROR",
  DATABASE_UNAVAILABLE: "DATABASE_UNAVAILABLE",
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