/**
 * EnergyMatrix EMS - logger da aplicacao (pino).
 *
 * Niveis INFO, WARN, ERROR, DEBUG. Campos: timestamp, service, operation,
 * requestId, status, error. Nunca registra senhas, tokens ou secrets.
 * As camadas superiores dependem apenas da porta `Logger`.
 */

import { pino } from "pino"
import type { Logger as LoggerPort } from "../domain/ports/logger.ts"
import type { Environment } from "../config/environment.ts"

export function createLogger(env: Environment) {
  const logger = pino({
    name: env.serviceName,
    level: env.logLevel,
    base: { service: env.serviceName, version: env.version },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "password",
        "token",
        "secret",
        "*.password",
        "*.token",
        "*.secret",
        "databaseUrl",
        "DATABASE_URL",
      ],
      censor: "[redacted]",
    },
    transport: env.isProduction
      ? undefined
      : { target: "pino/file", options: { destination: 1 } },
  })

  return logger
}

export type AppLogger = ReturnType<typeof createLogger>

/** Adaptador minimo: expoe apenas a porta de dominio aos services. */
export function toLoggerPort(logger: AppLogger, context: Record<string, unknown> = {}): LoggerPort {
  const bind = (extra: Record<string, unknown>): LoggerPort => ({
    debug: (message, fields) => logger.debug({ ...context, ...extra, ...fields }, message),
    info: (message, fields) => logger.info({ ...context, ...extra, ...fields }, message),
    warn: (message, fields) => logger.warn({ ...context, ...extra, ...fields }, message),
    error: (message, fields) => logger.error({ ...context, ...extra, ...fields }, message),
    child: (childContext) => bind({ ...extra, ...childContext }),
  })
  return bind({})
}

/** Logger no-op - usado em testes unitarios e em scripts pontuais. */
export const nullLogger: LoggerPort = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => nullLogger,
}