/**
 * Middlewares HTTP (ordem explicita, secao 8 do documento):
 *   requestId -> helmet/cors -> json parser -> logger -> rotas -> notFound
 *   -> errorHandler.
 *
 * Os middlewares sao a UNICA ponte entre HTTP e a aplicacao: nenhum deles
 * contem regra de negocio.
 */

import { randomUUID } from "node:crypto"
import type { NextFunction, Request, RequestHandler, Response } from "express"
import { ZodError, type ZodType } from "zod"
import {
  NotFoundError,
  isAppError,
  statusOf,
  toErrorBody,
  ValidationError,
} from "../../domain/errors/index.ts"
import type { Logger } from "../../domain/ports/index.ts"

export type RequestWithContext = Request & { requestId?: string; startedAt?: number }

/**
 * Requisicao com parametros de rota sempre string (o roteador garante o
 * formato do padrao; `string[]` nao ocorre neste projeto).
 */
export type RouteRequest = Request<Record<string, string>>

/** Identificador unico por requisicao (correlacao de logs). */
export function requestId(): RequestHandler {
  return (req, res, next) => {
    const id = (req.headers["x-request-id"] as string | undefined) ?? randomUUID()
    const ctx = req as RequestWithContext
    ctx.requestId = id
    ctx.startedAt = Date.now()
    res.setHeader("X-Request-Id", id)
    next()
  }
}

/** Log estruturado de acesso (sem corpo e sem dados sensiveis). */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const ctx = req as RequestWithContext
    res.on("finish", () => {
      const durationMs = Date.now() - (ctx.startedAt ?? Date.now())
      logger.info("http_request", {
        requestId: ctx.requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs,
      })
    })
    next()
  }
}

/** Encaminha erros de handlers assincronos para o errorHandler central. */
export function asyncHandler(
  handler: (req: RouteRequest, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req as unknown as RouteRequest, res, next).catch(next)
  }
}

/** Valida e substitui o corpo da requisicao pelo valor normalizado. */
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {})
    if (!result.success) {
      next(new ValidationError("Corpo da requisição inválido", formatZod(result.error)))
      return
    }
    req.body = result.data as Request["body"]
    next()
  }
}

/**
 * Valida a query string (page/limit/filtros).
 *
 * No Express 5 `req.query` e um getter somente-leitura: o valor validado e
 * publicado como propriedade propria da requisicao (shadow do getter), para
 * que os controllers continuem lendo `req.query` normalmente.
 */
export function validateQuery<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query ?? {})
    if (!result.success) {
      next(new ValidationError("Parâmetros inválidos", formatZod(result.error)))
      return
    }

    Object.defineProperty(req, "query", {
      value: result.data,
      configurable: true,
      enumerable: true,
      writable: true,
    })
    next()
  }
}

function formatZod(error: ZodError): Record<string, unknown> {
  return {
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  }
}

/** Rota nao encontrada - formatada pelo errorHandler. */
export function notFound(): RequestHandler {
  return (req, _res, next) => {
    next(new NotFoundError(`Rota não encontrada: ${req.method} ${req.originalUrl}`))
  }
}

/**
 * Tratamento central de erros. Padrao unico:
 *   { "error": { "code": "...", "message": "..." } }
 * Erros nao previstos viram 500 sem vazar stack trace ao cliente.
 */
export function errorHandler(logger: Logger): (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) => void {
  return (error, req, res, next) => {
    if (res.headersSent) {
      next(error)
      return
    }

    const ctx = req as RequestWithContext
    const status = statusOf(error)
    const body = toErrorBody(error)

    if (isAppError(error)) {
      logger.warn("app_error", {
        requestId: ctx.requestId,
        code: error.code,
        status,
        message: error.message,
      })
    } else {
      logger.error("unhandled_error", {
        requestId: ctx.requestId,
        status: 500,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    }

    res.status(status).json(body)
  }
}