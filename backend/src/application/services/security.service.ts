/**
 * Application service - SEGURANCA (secao 7.4 e 7.5).
 *
 * Gestao de usuarios do tenant (roles, status), trilha de auditoria e o
 * resumo de seguranca exibido em /api/security (rota exclusiva de ADMIN).
 * Nao expoe hash de senha nem token.
 */

import {
  ERROR_CODES,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../../domain/errors/index.ts"
import type { AuditLog, User } from "../../domain/entities/index.ts"
import { USER_ROLES, USER_STATUSES, type UserRole, type UserStatus } from "../../domain/value-objects/index.ts"
import { currentActor, type ActorContext } from "../../shared/tenant-context.ts"
import type { ServiceContext } from "../context.ts"
import { toPublicUser, type PublicUser } from "./auth.service.ts"

export function createSecurityService(ctx: ServiceContext) {
  const log = ctx.logger.child({ service: "SecurityService" })

  /** Sequencial local do audit log (o id e unico dentro do processo). */
  let auditSeq = 0

  function requireActor(): ActorContext {
    const actor = currentActor()
    if (!actor) throw new ForbiddenError("Sessao ausente", ERROR_CODES.UNAUTHORIZED)
    return actor
  }

  function requireAdmin(): ActorContext {
    const actor = requireActor()
    if (actor.role !== "ADMIN") {
      throw new ForbiddenError("Somente ADMIN acessa a administracao de seguranca", ERROR_CODES.FORBIDDEN)
    }
    return actor
  }

  async function overview() {
    const actor = requireActor()
    const users = await ctx.users.list(actor.tenantId)

    const byRole = USER_ROLES.reduce<Record<string, number>>((acc, role) => {
      acc[role] = users.filter((u) => u.role === role).length
      return acc
    }, {})

    return {
      tenantId: actor.tenantId,
      roles: USER_ROLES,
      totalUsers: users.length,
      byRole,
      byStatus: USER_STATUSES.reduce<Record<string, number>>((acc, status) => {
        acc[status] = users.filter((u) => u.status === status).length
        return acc
      }, {}),
      permissions: PERMISSIONS,
      note: "Senhas nunca trafegam nem sao retornadas: apenas o hash (scrypt) fica no repositorio. Refresh tokens ficam guardados como hash SHA-256 e sao revogados no logout.",
    }
  }

  async function auditLogs(limit = 100): Promise<AuditLog[]> {
    const actor = requireAdmin()
    return ctx.auditLogs.list(actor.tenantId, limit)
  }

  async function record(entry: Omit<AuditLog, "id" | "createdAt">): Promise<AuditLog> {
    const actor = currentActor()
    auditSeq += 1
    return ctx.auditLogs.append({
      ...entry,
      id: `aud-${ctx.clock.now().getTime()}-${auditSeq}`,
      createdAt: ctx.clock.now().toISOString(),
      userId: entry.userId ?? actor?.userId ?? null,
    })
  }

  /** Troca de role (ADMIN). */
  async function setUserRole(id: string, role: string): Promise<PublicUser> {
    const actor = requireAdmin()
    const target = role.toUpperCase() as UserRole

    if (!USER_ROLES.includes(target)) {
      throw new ValidationError(`Role invalida. Use uma de: ${USER_ROLES.join(", ")}`)
    }

    const user = await ctx.users.findById(id, actor.tenantId)
    if (!user) throw new NotFoundError("Usuario nao encontrado", ERROR_CODES.USER_NOT_FOUND)

    // Impede que o ultimo ADMIN do tenant se rebaixe (trava o acesso).
    if (user.role === "ADMIN" && target !== "ADMIN") {
      const admins = await ctx.users.countByRole(actor.tenantId, "ADMIN")
      if (admins <= 1) {
        throw new ValidationError("O tenant precisa manter ao menos um ADMIN")
      }
    }

    const updated = await ctx.users.update(id, actor.tenantId, {
      role: target,
      updatedAt: ctx.clock.now().toISOString(),
    })
    if (!updated) throw new NotFoundError("Usuario nao encontrado", ERROR_CODES.USER_NOT_FOUND)

    await record({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "user.role_changed",
      resource: "user",
      resourceId: id,
      metadata: { from: user.role, to: target },
    })

    log.info("Role alterada", { userId: id, role: target })
    return toPublicUser(updated as User)
  }

  /** Ativa/desativa um usuario (ADMIN). */
  async function setUserStatus(id: string, status: string): Promise<PublicUser> {
    const actor = requireAdmin()
    const target = status.toLowerCase() as UserStatus

    if (!USER_STATUSES.includes(target)) {
      throw new ValidationError(`Status invalido. Use um de: ${USER_STATUSES.join(", ")}`)
    }

    const user = await ctx.users.findById(id, actor.tenantId)
    if (!user) throw new NotFoundError("Usuario nao encontrado", ERROR_CODES.USER_NOT_FOUND)

    if (user.id === actor.userId && target !== "active") {
      throw new ValidationError("Voce nao pode desativar a propria conta")
    }

    const updated = await ctx.users.update(id, actor.tenantId, {
      status: target,
      updatedAt: ctx.clock.now().toISOString(),
    })
    if (!updated) throw new NotFoundError("Usuario nao encontrado", ERROR_CODES.USER_NOT_FOUND)

    // Desativar encerra as sessoes do usuario.
    if (target !== "active") await ctx.refreshTokens.revokeAllForUser(id, ctx.clock.now())

    await record({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "user.status_changed",
      resource: "user",
      resourceId: id,
      metadata: { from: user.status, to: target },
    })

    return toPublicUser(updated as User)
  }

  return { overview, auditLogs, record, setUserRole, setUserStatus }
}

export type SecurityService = ReturnType<typeof createSecurityService>

/** Matriz de permissao exibida na tela /security (D13). */
export const PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  ADMIN: [
    "dashboard",
    "machines",
    "alerts",
    "events",
    "impact",
    "economy",
    "interventions",
    "reports",
    "admin",
    "security",
  ],
  ACCOUNTING: ["dashboard", "economy", "interventions", "reports"],
  MACHINE_EVALUATOR: ["dashboard", "machines", "alerts", "events", "impact", "interventions", "reports"],
}