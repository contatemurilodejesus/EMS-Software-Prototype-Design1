/**
 * Porta de LOG estruturado (implementada por infra/logger.ts com pino).
 *
 * O dominio e a aplicacao dependem desta interface - nunca do pino.
 */

export interface LogFields {
  [key: string]: unknown
}

export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  child(context: LogFields): Logger
}