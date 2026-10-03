/**
 * Middlewares HTTP (ordem explicita, secao 8 do documento):
 *   requestId -> helmet/cors -> rateLimit -> json parser -> logger -> rotas
 *   -> notFound -> errorHandler.
 *
 * Os middlewares sao a UNICA ponte entre HTTP e a aplicacao: nenhum deles
 * contem regra de negocio.
 *
 * Autenticacao (secao 7): `authenticate` valida o access token, publica o
 * ator em `AsyncLocalStorage` (tenant EXPLICITO vem do token - nunca do
 * body/query/header) e `requireRole` aplica o RBAC (D13).
 */

import { randomUUID } from "node:crypto"
import type { NextFunction, Request, RequestHandler, Response } from "express"
import { ZodError, type ZodType } from "zod"
import {
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ERROR_CODES,
  isAppError,
  statusOf,
  toErrorBody,
  ValidationError,
} from "../../domain/errors/index.ts"
import { runWithActor } from "../../shared/tenant-context.ts"
import type { UserRole } from "../../domain/value-objects/index.ts"
import type { AuthService } from "../../application/services/auth.service.ts"
import type { Logger } from "../../domain/ports/index.ts"

export type RequestWithContext = Request & {
  requestId?: string
  startedAt?: number
  /** Ator autenticado publicado pelo middleware `authenticate`. */
  actor?: { tenantId: string; userId: string; role: UserRole }
}

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

/* ------------------------------------------------------------------ */
/* Autenticacao e autorizacao (secao 7)                                */
/* ------------------------------------------------------------------ */

/** Extrai o access token do header Authorization. */
function bearerToken(req: Request): string | null {
  const header = req.headers.authorization
  if (!header || !header.toLowerCase().startsWith("bearer ")) return null
  const token = header.slice(7).trim()
  return token || null
}

/**
 * Exige access token valido e publica o ator no contexto da requisicao.
 * O `tenantId` vem SEMPRE das claims do token (secao 7.1.1) - os repositories
 * leem `currentTenantId()` para filtrar.
 */
export function authenticate(auth: AuthService): RequestHandler {
  return (req, res, next) => {
    const token = bearerToken(req)

    if (!token) {
      next(new UnauthorizedError("Token de acesso ausente", ERROR_CODES.UNAUTHORIZED))
      return
    }

    auth
      .authenticate(token)
      .then(({ user }) => {
        const actor = { tenantId: user.tenantId, userId: user.id, role: user.role }
        ;(req as RequestWithContext).actor = actor
        res.setHeader("X-Tenant-Id", actor.tenantId)
        // Todo o restante da requisicao roda com o tenant do token.
        runWithActor(actor, next)
      })
      .catch(next)
  }
}

/** RBAC (D13): ADMIN / ACCOUNTING / MACHINE_EVALUATOR por endpoint. */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    const actor = (req as RequestWithContext).actor
    if (!actor) {
      next(new UnauthorizedError("Sessao ausente", ERROR_CODES.UNAUTHORIZED))
      return
    }
    if (roles.length && !roles.includes(actor.role)) {
      next(
        new ForbiddenError(
          `Acesso restrito a: ${roles.join(", ")}`,
          ERROR_CODES.FORBIDDEN,
        ),
      )
      return
    }
    next()
  }
}

/**
 * Rate limiting em memoria por janela deslizante simples (secao 7.2:
 * "ha rate limiting nas tentativas"). Suficiente para o MVP; em producao
 * o mesmo contrato pode ser servido por Redis.
 */
export function rateLimit(options: { windowMs: number; max: number; message?: string }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>()

  return (req, res, next) => {
    const now = Date.now()
    const key = req.ip ?? req.socket.remoteAddress ?? "desconhecido"
    const entry = hits.get(key)

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs })
      next()
      return
    }

    entry.count += 1
    if (entry.count > options.max) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)))
      next(
        new RateLimitError(
          options.message ?? "Muitas requisicoes. Tente novamente em instantes.",
          { retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) },
        ),
      )
      return
    }

    next()
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