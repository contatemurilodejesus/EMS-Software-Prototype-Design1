/**
 * Aplicacao Express (secao 8): middlewares na ordem documentada e o roteador
 * da API em `/api`. Nao abre porta: quem faz isso e `server.ts`.
 *
 * Separar `app.ts` de `server.ts` permite testes de integracao sem socket.
 */

import express, { type Express } from "express"
import helmet from "helmet"
import { cors } from "../presentation/middleware/cors.ts"
import { securityHeaders } from "../presentation/middleware/cors.ts"
import { createApiRouter } from "../presentation/routes/index.ts"
import {
  errorHandler,
  notFound,
  requestId,
  requestLogger,
} from "../presentation/middleware/index.ts"
import type { ApplicationServices } from "../application/services/index.ts"
import type { Environment } from "../config/environment.ts"
import type { Logger } from "../domain/ports/index.ts"

export interface CreateAppOptions {
  services: ApplicationServices
  env: Environment
  logger: Logger
}

export function createApp(options: CreateAppOptions): Express {
  const { services, env, logger } = options

  const app = express()
  app.disable("x-powered-by")

  // 1) correlacao -> 2) security headers -> 3) cors -> 4) helmet -> 5) json parser -> 6) logger
  app.use(requestId())
  app.use(securityHeaders({ isProduction: env.isProduction }))
  app.use(cors(env.corsOrigin))
  app.use(
    helmet({
      contentSecurityPolicy: false, // prototipo embutido no Vite dev/preview
      crossOriginEmbedderPolicy: false,
    }),
  )
  app.use(express.json({ limit: env.bodyLimit }))
  app.use(requestLogger(logger))

  // 5) rotas da API (limites por categoria vem do environment)
  app.use(env.apiPrefix, createApiRouter(services, env))

  // 6) notFound -> 7) errorHandler
  app.use(notFound())
  app.use(errorHandler(logger))

  return app
}