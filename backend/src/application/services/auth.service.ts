/**
 * Application service - AUTENTICACAO (secao 7.3).
 *
 * Login -> access token curto (JWT HS256) + refresh token opaco gravado
 * apenas como hash (D5). Logout revoga o refresh token. O convite de uso
 * unico (7.2) cria a conta individual do novo usuario.
 *
 * Regra do documento: a mensagem de erro do login e SEMPRE generica
 * ("credenciais invalidas") - nunca revela se o e-mail existe.
 */

import { randomUUID } from "node:crypto"
import {
  ConflictError,
  ERROR_CODES,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../../domain/errors/index.ts"
import type { AuditLog, Invite, RefreshToken, Tenant, User } from "../../domain/entities/index.ts"
import type { UserRole } from "../../domain/value-objects/index.ts"
import {
  hashPassword,
  randomToken,
  sha256,
  signJwt,
  verifyJwt,
  verifyPassword,
} from "../../shared/security/index.ts"
import { currentActor, runWithActor } from "../../shared/tenant-context.ts"
import type { ServiceContext } from "../context.ts"

export interface AuthDependencies {
  tenants: {
    findById(id: string): Promise<Tenant | null>
    save(tenant: Tenant): Promise<Tenant>
  }
  inviteTtlHours: number
  jwtAccessSecret: string
  jwtRefreshSecret: string
  accessTtlMinutes: number
  refreshTtlDays: number
  /** Grava a trilha de auditoria (7.5) - nunca guarda senha nem token. */
  onAudit?: (entry: Omit<AuditLog, "id" | "createdAt">) => Promise<void>
}

export interface AuthSession {
  accessToken: string
  refreshToken: string
  expiresInMinutes: number
  user: PublicUser
  tenant: Tenant
}

export interface PublicUser {
  id: string
  tenantId: string
  name: string
  email: string
  role: UserRole
  status: string
}

export interface LoginInput {
  email?: unknown
  password?: unknown
}

export interface InviteInput {
  email?: unknown
  name?: unknown
  role?: unknown
}

export interface AcceptInviteInput {
  code?: unknown
  name?: unknown
  email?: unknown
  password?: unknown
}

const ROLES: readonly UserRole[] = ["ADMIN", "ACCOUNTING", "MACHINE_EVALUATOR"]

/** Remove o hash antes de devolver o usuario ao cliente. */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    tenantId: user.tenantId,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
  }
}

export function createAuthService(ctx: ServiceContext, deps: AuthDependencies) {
  const log = ctx.logger.child({ service: "AuthService" })

  async function audit(entry: Omit<AuditLog, "id" | "createdAt">): Promise<void> {
    if (deps.onAudit) await deps.onAudit(entry)
  }

  /** Emite o par de tokens (D5): access curto + refresh guardado como hash. */
  async function issueSession(user: User): Promise<AuthSession> {
    const now = ctx.clock.now()
    const tenant = await deps.tenants.findById(user.tenantId)
    if (!tenant) {
      throw new UnauthorizedError("Tenant inativo ou inexistente", ERROR_CODES.UNAUTHORIZED)
    }

    const accessToken = signJwt(
      { sub: user.id, tenantId: user.tenantId, role: user.role, kind: "access" },
      {
        secret: deps.jwtAccessSecret,
        ttlSeconds: deps.accessTtlMinutes * 60,
        now,
      },
    )

    const refreshPlain = randomToken(48)
    const refresh: RefreshToken = {
      id: `rt-${user.id}-${now.getTime()}`,
      tenantId: user.tenantId,
      userId: user.id,
      tokenHash: sha256(refreshPlain),
      expiresAt: new Date(now.getTime() + deps.refreshTtlDays * 86400000).toISOString(),
      revokedAt: null,
    }
    await ctx.refreshTokens.save(refresh)

    return {
      accessToken,
      refreshToken: refreshPlain,
      expiresInMinutes: deps.accessTtlMinutes,
      user: toPublicUser(user),
      tenant,
    }
  }

  /** POST /api/auth/login - mensagem de erro generica (7.3). */
  async function login(input: LoginInput): Promise<AuthSession> {
    const email = String(input.email ?? "").trim().toLowerCase()
    const password = String(input.password ?? "")

    if (!email || !password) {
      throw new ValidationError("E-mail e senha sao obrigatorios")
    }

    const user = await ctx.users.findByEmail(email)
    const invalid = new UnauthorizedError("Credenciais invalidas", ERROR_CODES.INVALID_CREDENTIALS)

    if (!user || !verifyPassword(password, user.passwordHash)) {
      await audit({
        tenantId: user?.tenantId ?? null,
        userId: user?.id ?? null,
        action: "auth.login_failed",
        resource: "auth",
      })
      throw invalid
    }

    if (user.status !== "active") {
      throw new UnauthorizedError("Usuario sem acesso ativo", ERROR_CODES.UNAUTHORIZED)
    }

    // Escritas pos-login (ultimo login + refresh token) rodam COM o tenant
    // do usuario: a RLS exige `app.tenant_id`, e este wrap e o unico ponto
    // que cria contexto antes da sessao existir.
    const session = await runWithActor(
      { tenantId: user.tenantId, userId: user.id, role: user.role },
      async () => {
        await ctx.users.update(user.id, user.tenantId, {
          lastLoginAt: ctx.clock.now().toISOString(),
        })
        return issueSession(user)
      },
    )
    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "auth.login",
      resource: "auth",
    })

    log.info("Login realizado", { userId: user.id, tenantId: user.tenantId })
    return session
  }

  /** POST /api/auth/refresh - rotaciona o refresh e devolve novo access. */
  async function refresh(plain: string): Promise<AuthSession> {
    if (!plain) throw new UnauthorizedError("Refresh token ausente", ERROR_CODES.TOKEN_INVALID)

    // Lookup pre-tenant via funcao SECURITY DEFINER (migration 005); as
    // escritas abaixo (revoke + novo refresh) rodam sob a RLS do tenant
    // proprio do token validado.
    const stored = await ctx.refreshTokens.findByHash(sha256(plain))
    const now = ctx.clock.now()

    if (!stored || stored.revokedAt) {
      throw new UnauthorizedError("Refresh token invalido", ERROR_CODES.TOKEN_INVALID)
    }
    if (new Date(stored.expiresAt).getTime() <= now.getTime()) {
      throw new UnauthorizedError("Refresh token expirado", ERROR_CODES.TOKEN_EXPIRED)
    }

    // `role` e interno neste wrap (a RLS so usa tenantId); o RBAC do
    // request usa o actor do middleware, derivado do access token valido.
    return runWithActor(
      { tenantId: stored.tenantId, userId: stored.userId, role: "ADMIN" },
      async () => {
        await ctx.refreshTokens.revoke(stored.tokenHash, now)

        const user = await ctx.users.findById(stored.userId, stored.tenantId)
        if (!user || user.status !== "active") {
          throw new UnauthorizedError("Usuario sem acesso ativo", ERROR_CODES.UNAUTHORIZED)
        }

        return issueSession(user)
      },
    )
  }

  /** POST /api/auth/logout - revoga o refresh informado. */
  async function logout(plain: string | undefined): Promise<{ revoked: boolean }> {
    if (!plain) return { revoked: false }
    const tokenHash = sha256(plain)

    // A RLS so permite revogar COM o tenant do registro: o lookup pre-tenant
    // (funcao SECURITY DEFINER da 005) devolve o tenant e o revoke roda
    // dentro do contexto proprio do token.
    const stored = await ctx.refreshTokens.findByHash(tokenHash)
    let revoked = false
    if (stored) {
      revoked = await runWithActor(
        { tenantId: stored.tenantId, userId: stored.userId, role: "ADMIN" },
        () => ctx.refreshTokens.revoke(tokenHash, ctx.clock.now()),
      )
    }

    const actor = currentActor()
    await audit({
      tenantId: actor?.tenantId ?? stored?.tenantId ?? null,
      userId: actor?.userId ?? stored?.userId ?? null,
      action: "auth.logout",
      resource: "auth",
    })
    return { revoked }
  }
/** GET /api/auth/me - identidade do token (usada pelo frontend). */
  async function me(): Promise<{ user: PublicUser; tenant: Tenant }> {
    const actor = currentActor()
    if (!actor) throw new UnauthorizedError("Sessao ausente", ERROR_CODES.UNAUTHORIZED)

    const user = await ctx.users.findById(actor.userId, actor.tenantId)
    if (!user) throw new NotFoundError("Usuario nao encontrado", ERROR_CODES.USER_NOT_FOUND)

    const tenant = await deps.tenants.findById(user.tenantId)
    if (!tenant) throw new UnauthorizedError("Tenant nao encontrado", ERROR_CODES.UNAUTHORIZED)

    return { user: toPublicUser(user), tenant }
  }

  /** POST /api/auth/invites (ADMIN) - codigo de uso unico, guardado como hash. */
  async function createInvite(input: InviteInput): Promise<Invite & { code: string }> {
    const email = String(input.email ?? "").trim().toLowerCase()
    const role = String(input.role ?? "MACHINE_EVALUATOR") as UserRole

    if (!email) throw new ValidationError("E-mail do convidado e obrigatorio")
    if (!ROLES.includes(role)) {
      throw new ValidationError(`Role invalida. Use uma de: ${ROLES.join(", ")}`)
    }

    const actor = currentActor()
    if (!actor) throw new UnauthorizedError("Sessao ausente", ERROR_CODES.UNAUTHORIZED)

    const existing = await ctx.users.findByEmail(email)
    if (existing) {
      throw new ConflictError("Ja existe usuario com este e-mail", ERROR_CODES.EMAIL_ALREADY_EXISTS)
    }

    const now = ctx.clock.now()
    const code = randomToken(24)
    const invite: Invite = {
      id: `inv-${now.getTime()}-${sha256(email).slice(0, 8)}`,
      tenantId: actor.tenantId,
      role,
      codeHash: sha256(code),
      expiresAt: new Date(now.getTime() + deps.inviteTtlHours * 3600000).toISOString(),
      usedAt: null,
      createdBy: actor.userId,
      usedBy: null,
    }

    await ctx.invites.save(invite)
    await audit({
      tenantId: invite.tenantId,
      userId: actor.userId,
      action: "invite.created",
      resource: "invite",
      resourceId: invite.id,
      metadata: { email, role },
    })

    log.info("Convite gerado", { inviteId: invite.id, role })
    // O codigo puro aparece UMA vez (7.2) - so o hash fica persistido.
    return { ...invite, code }
  }

  async function listInvites(): Promise<Invite[]> {
    const actor = currentActor()
    if (!actor) throw new UnauthorizedError("Sessao ausente", ERROR_CODES.UNAUTHORIZED)
    return ctx.invites.list(actor.tenantId)
}

  /** POST /api/auth/invites/accept - cria a conta e invalida o codigo. */
  async function acceptInvite(input: AcceptInviteInput): Promise<AuthSession> {
    const code = String(input.code ?? "").trim()
    const name = String(input.name ?? "").trim()
    const password = String(input.password ?? "")

    if (!code) throw new ValidationError("Codigo de convite e obrigatorio")
    if (!name) throw new ValidationError("Nome e obrigatorio")
    if (password.length < 8) throw new ValidationError("A senha deve ter ao menos 8 caracteres")

    const invite = await ctx.invites.findByCodeHash(sha256(code))
    const now = ctx.clock.now()

    if (!invite || invite.usedAt) {
      throw new UnauthorizedError("Codigo de convite invalido", ERROR_CODES.INVITE_INVALID)
    }
    if (new Date(invite.expiresAt).getTime() <= now.getTime()) {
      throw new UnauthorizedError("Codigo de convite expirado", ERROR_CODES.INVITE_INVALID)
    }

    // O e-mail do convidado fica disponivel no invite; o cadastro usa o
    // e-mail informado no pedido de convite (o codigo e o que autoriza).
    // id em UUID (node:crypto): o banco usa PK UUID em `users`.
    const user: User = {
      id: randomUUID(),
      tenantId: invite.tenantId,
      name,
      email: String(input.email ?? `convite-${invite.id}@energymatrix.local`).trim().toLowerCase(),
      passwordHash: hashPassword(password),
      role: invite.role,
      status: "active",
      lastLoginAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    // Escritas do aceite rodam COM o tenant do convite (RLS): salvar o
    // usuario, marcar o codigo como usado e emitir a sessao.
    return runWithActor(
      { tenantId: invite.tenantId, userId: user.id, role: user.role },
      async () => {
        await ctx.users.save(user)

        await ctx.invites.update(invite.id, invite.tenantId, {
          usedAt: now.toISOString(),
          usedBy: user.id,
        })

        await audit({
          tenantId: invite.tenantId,
          userId: user.id,
          action: "invite.accepted",
          resource: "user",
          resourceId: user.id,
        })

        return issueSession(user)
      },
    )
  }

  /** Troca de senha do proprio usuario (POST /api/auth/password). */
  async function changePassword(input: {
    currentPassword?: unknown
    newPassword?: unknown
  }): Promise<{ changed: boolean }> {
    const actor = currentActor()
    if (!actor) throw new UnauthorizedError("Sessao ausente", ERROR_CODES.UNAUTHORIZED)

    const next = String(input.newPassword ?? "")
    if (next.length < 8) throw new ValidationError("A nova senha deve ter ao menos 8 caracteres")

    const user = await ctx.users.findById(actor.userId, actor.tenantId)
    if (!user) throw new NotFoundError("Usuario nao encontrado", ERROR_CODES.USER_NOT_FOUND)
    if (!verifyPassword(String(input.currentPassword ?? ""), user.passwordHash)) {
      throw new UnauthorizedError("Senha atual invalida", ERROR_CODES.INVALID_CREDENTIALS)
    }

    const now = ctx.clock.now()
    await ctx.users.update(user.id, user.tenantId, {
      passwordHash: hashPassword(next),
      updatedAt: now.toISOString(),
    })
    await ctx.refreshTokens.revokeAllForUser(user.id, now)

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      action: "user.password_changed",
      resource: "user",
      resourceId: user.id,
    })

    return { changed: true }
  }

  /** Lista de usuarios do tenant do contexto (sem hash). */
  async function listUsers(): Promise<PublicUser[]> {
    const actor = currentActor()
    if (!actor) throw new UnauthorizedError("Sessao ausente", ERROR_CODES.UNAUTHORIZED)
    const users = await ctx.users.list(actor.tenantId)
    return users.map(toPublicUser)
  }

  /**
   * Validacao usada pelo middleware: devolve user + tenant a partir do access
   * token e confirma que ambos continuam ativos.
   */
  async function authenticate(accessToken: string): Promise<{ user: User; tenant: Tenant }> {
    const result = verifyJwt(accessToken, deps.jwtAccessSecret, ctx.clock.now())

    if (!result.ok) {
      const code =
        result.reason === "expired" ? ERROR_CODES.TOKEN_EXPIRED : ERROR_CODES.TOKEN_INVALID
      throw new UnauthorizedError("Token invalido ou expirado", code)
    }

    const claims = result.claims
    if (claims.kind !== "access") {
      throw new UnauthorizedError("Refresh token nao vale como acesso", ERROR_CODES.TOKEN_INVALID)
    }

    // As claims sao assinadas (confiaveis): o wrap usa o tenant DELAS para
    // que `users`/`tenants` sejam lidos sob a RLS do proprio token - um
    // access token de outro tenant nao enxerga o usuario.
    return runWithActor(
      { tenantId: claims.tenantId, userId: claims.sub, role: claims.role as UserRole },
      async () => {
        const user = await ctx.users.findById(claims.sub, claims.tenantId)
        if (!user || user.status !== "active") {
          throw new UnauthorizedError("Usuario sem acesso ativo", ERROR_CODES.UNAUTHORIZED)
        }

        const tenant = await deps.tenants.findById(claims.tenantId)
        if (!tenant || tenant.status !== "active") {
          throw new UnauthorizedError("Tenant sem acesso ativo", ERROR_CODES.UNAUTHORIZED)
        }

        return { user, tenant }
      },
    )
  }

  return {
    login,
    refresh,
    logout,
    me,
    createInvite,
    listInvites,
    acceptInvite,
    changePassword,
    listUsers,
    authenticate,
    issueSession,
  }
}

export type AuthService = ReturnType<typeof createAuthService>
