/**
 * Graceful shutdown (secao 8): SIGTERM/SIGINT -> bloquear novas requisicoes ->
 * aguardar as atuais -> fechar recursos -> encerrar o processo.
 */

import type { Server } from "node:http"
import type { Logger } from "../domain/ports/index.ts"

export interface ShutdownOptions {
  server: Server
  logger: Logger
  /** Fecha recursos externos (pool do banco, agendador). */
  closeResources: () => Promise<void> | void
  timeoutMs?: number
  exit?: (code: number) => void
}

export function registerShutdownHandlers(options: ShutdownOptions): void {
  const timeoutMs = options.timeoutMs ?? 10_000
  let shuttingDown = false

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    options.logger.info("shutdown_started", { signal })

    const timer = setTimeout(() => {
      options.logger.error("shutdown_timeout", { signal, timeoutMs })
      options.exit?.(1)
    }, timeoutMs)

    try {
      await new Promise<void>((resolve) => {
        options.server.close(() => resolve())
      })
      await options.closeResources()
      clearTimeout(timer)
      options.logger.info("shutdown_complete", { signal })
      options.exit?.(0)
    } catch (error) {
      clearTimeout(timer)
      options.logger.error("shutdown_failed", { signal, error: String(error) })
      options.exit?.(1)
    }
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  process.on("SIGINT", () => void shutdown("SIGINT"))
}