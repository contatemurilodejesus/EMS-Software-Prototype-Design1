/**
 * Repositories PostgreSQL - identidade (tenants, users, invites, refresh tokens).
 *
 * Cada metodo implementa um port do dominio. O filtro de tenant e feito em
 * DOIS lugares: na Clausula WHERE (indice) e na RLS do banco (defesa em
 * profundidade). Quem chama ja aplicou `set_tenant`, mas a RLS vale mesmo se
 * alguem esquecer.
 *
 * NOTA: `login` e `findByEmail` sao globais de proposito - o e-mail e unico
 * entre tenants (D15) e happens ANTES de existir tenant no contexto. Por isso
 *Rodam sem `app.tenant_id`, e nao vazam dado sensivel alem do proprio login.
 */

import type { Invite, RefreshToken, Tenant, User } from "../../domain/entities/index.ts"
import type { UserRole } from "../../domain/value-objects/index.ts"
import type {
  IInviteRepository,
  IRefreshTokenRepository,
  ITenantRepository,
  IUserRepository,
} from "../../domain/ports/index.ts"
import type { DatabasePort } from "./pool.ts"

/** Reconstroi o usuario (o `password_hash` nunca sai do repository). */
function toUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    email: String(row.email),
    passwordHash: String(row.password_hash),
    role: row.role as UserRole,
    status: row.status as User["status"],
    lastLoginAt: row.last_login_at ? String(row.last_login_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export function createPostgresTenantRepository(db: DatabasePort): ITenantRepository {
  return {
    async list(): Promise<Tenant[]> {
      const { rows } = await db.query(
        "SELECT id::text, name, slug, status, created_at, updated_at FROM tenants ORDER BY name",
      )
      return rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        slug: String(row.slug),
        status: row.status as Tenant["status"],
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }))
    },

    async findById(id: string): Promise<Tenant | null> {
      const { rows } = await db.query(
        "SELECT id::text, name, slug, status, created_at, updated_at FROM tenants WHERE id = $1",
        [id],
      )
      const row = rows[0]
      if (!row) return null
      return {
        id: String(row.id),
        name: String(row.name),
        slug: String(row.slug),
        status: row.status as Tenant["status"],
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }
    },

    async findBySlug(slug: string): Promise<Tenant | null> {
      const { rows } = await db.query(
        "SELECT id::text, name, slug, status, created_at, updated_at FROM tenants WHERE slug = $1",
        [slug],
      )
      const row = rows[0]
      if (!row) return null
      return {
        id: String(row.id),
        name: String(row.name),
        slug: String(row.slug),
        status: row.status as Tenant["status"],
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }
    },

    async save(tenant: Tenant): Promise<Tenant> {
      await db.query(
        `INSERT INTO tenants (id, name, slug, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name, slug = EXCLUDED.slug, status = EXCLUDED.status`,
        [tenant.id, tenant.name, tenant.slug, tenant.status],
      )
      return tenant
    },

    async update(id: string, patch: Partial<Tenant>): Promise<Tenant | null> {
      const { rows } = await db.query(
        `UPDATE tenants
            SET name = COALESCE($2, name),
                slug = COALESCE($3, slug),
                status = COALESCE($4, status),
                updated_at = now()
          WHERE id = $1
        RETURNING id::text, name, slug, status, created_at, updated_at`,
        [id, patch.name ?? null, patch.slug ?? null, patch.status ?? null],
      )
      const row = rows[0]
      if (!row) return null
      return {
        id: String(row.id),
        name: String(row.name),
        slug: String(row.slug),
        status: row.status as Tenant["status"],
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }
    },
  }
}
export function createPostgresUserRepository(db: DatabasePort): IUserRepository {
  const COLUMNS = `id::text, tenant_id::text, name, email, password_hash,
                   role, status, last_login_at, created_at, updated_at`

  return {
    async list(tenantId: string): Promise<User[]> {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM users WHERE tenant_id = $1 ORDER BY name`,
        [tenantId],
      )
      return rows.map(toUser)
    },

    async findById(id: string, tenantId: string): Promise<User | null> {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM users WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId],
      )
      return rows[0] ? toUser(rows[0]) : null
    },

    /**
     * Busca global por e-mail (login). O e-mail e unico entre tenants (D15),
     * entao filtrar por tenant aqui seria um bug, nao uma protecao.
     */
    async findByEmail(email: string): Promise<User | null> {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM users WHERE lower(email) = lower($1)`,
        [email],
      )
      return rows[0] ? toUser(rows[0]) : null
    },

    async countByRole(tenantId: string, role: UserRole): Promise<number> {
      const { rows } = await db.query(
        "SELECT count(*)::int AS n FROM users WHERE tenant_id = $1 AND role = $2",
        [tenantId, role],
      )
      return rows[0]?.n ?? 0
    },

    async save(user: User): Promise<User> {
      await db.query(
        `INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, last_login_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name, email = EXCLUDED.email,
               password_hash = EXCLUDED.password_hash, role = EXCLUDED.role,
               status = EXCLUDED.status, last_login_at = EXCLUDED.last_login_at,
               updated_at = now()`,
        [
          user.id,
          user.tenantId,
          user.name,
          user.email,
          user.passwordHash,
          user.role,
          user.status,
          user.lastLoginAt ?? null,
        ],
      )
      return user
    },

    async update(id: string, tenantId: string, patch: Partial<User>): Promise<User | null> {
      const { rows } = await db.query(
        `UPDATE users
            SET name = COALESCE($3, name),
                email = COALESCE($4, email),
                password_hash = COALESCE($5, password_hash),
                role = COALESCE($6, role),
                status = COALESCE($7, status),
                last_login_at = COALESCE($8, last_login_at),
                updated_at = now()
          WHERE id = $1 AND tenant_id = $2
        RETURNING ${COLUMNS}`,
        [
          id,
          tenantId,
          patch.name ?? null,
          patch.email ?? null,
          patch.passwordHash ?? null,
          patch.role ?? null,
          patch.status ?? null,
          patch.lastLoginAt ?? null,
        ],
      )
      return rows[0] ? toUser(rows[0]) : null
    },
  }
}

export function createPostgresInviteRepository(db: DatabasePort): IInviteRepository {
  const COLUMNS = `id::text, tenant_id::text, role, code_hash,
                   expires_at, used_at, created_by::text, used_by::text`

  function toInvite(row: Record<string, unknown>): Invite {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      role: row.role as UserRole,
      codeHash: String(row.code_hash),
      expiresAt: String(row.expires_at),
      usedAt: row.used_at ? String(row.used_at) : null,
      createdBy: String(row.created_by),
      usedBy: row.used_by ? String(row.used_by) : null,
    }
  }

  return {
    async list(tenantId: string): Promise<Invite[]> {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM invites WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [tenantId],
      )
      return rows.map(toInvite)
    },

    async findById(id: string, tenantId: string): Promise<Invite | null> {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM invites WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId],
      )
      return rows[0] ? toInvite(rows[0]) : null
    },

    async findByCodeHash(codeHash: string): Promise<Invite | null> {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM invites WHERE code_hash = $1`,
        [codeHash],
      )
      return rows[0] ? toInvite(rows[0]) : null
    },

    async save(invite: Invite): Promise<Invite> {
      await db.query(
        `INSERT INTO invites (id, tenant_id, role, code_hash, expires_at,
                              used_at, created_by, used_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE
           SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at,
               used_at = EXCLUDED.used_at, used_by = EXCLUDED.used_by`,
        [
          invite.id,
          invite.tenantId,
          invite.role,
          invite.codeHash,
          invite.expiresAt,
          invite.usedAt ?? null,
          invite.createdBy,
          invite.usedBy ?? null,
        ],
      )
      return invite
    },

    async update(
      id: string,
      tenantId: string,
      patch: Partial<Invite>,
    ): Promise<Invite | null> {
      const { rows } = await db.query(
        `UPDATE invites
            SET expires_at = COALESCE($3, expires_at),
                used_at = COALESCE($4, used_at),
                used_by = COALESCE($5, used_by),
                updated_at = now()
          WHERE id = $1 AND tenant_id = $2
        RETURNING ${COLUMNS}`,
        [id, tenantId, patch.expiresAt ?? null, patch.usedAt ?? null, patch.usedBy ?? null],
      )
      return rows[0] ? toInvite(rows[0]) : null
    },
  }
}
export function createPostgresRefreshTokenRepository(
  db: DatabasePort,
): IRefreshTokenRepository {
  function toToken(row: Record<string, unknown>): RefreshToken {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      userId: String(row.user_id),
      tokenHash: String(row.token_hash),
      expiresAt: String(row.expires_at),
      revokedAt: row.revoked_at ? String(row.revoked_at) : null,
      ip: row.ip ? String(row.ip) : undefined,
      userAgent: row.user_agent ? String(row.user_agent) : undefined,
    }
  }

  return {
    async findByHash(tokenHash: string): Promise<RefreshToken | null> {
      const { rows } = await db.query(
        `SELECT id::text, tenant_id::text, user_id::text, token_hash,
                expires_at, revoked_at, ip, user_agent
           FROM refresh_tokens WHERE token_hash = $1`,
        [tokenHash],
      )
      return rows[0] ? toToken(rows[0]) : null
    },

    async save(token: RefreshToken): Promise<RefreshToken> {
      await db.query(
        `INSERT INTO refresh_tokens (id, tenant_id, user_id, token_hash,
                                    expires_at, revoked_at, ip, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE
           SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at,
               revoked_at = EXCLUDED.revoked_at`,
        [
          token.id,
          token.tenantId,
          token.userId,
          token.tokenHash,
          token.expiresAt,
          token.revokedAt ?? null,
          token.ip ?? null,
          token.userAgent ?? null,
        ],
      )
      return token
    },

    async revoke(tokenHash: string, at: Date): Promise<boolean> {
      const result = await db.query(
        "UPDATE refresh_tokens SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL",
        [tokenHash, at.toISOString()],
      )
      return (result.rowCount ?? 0) > 0
    },

    async revokeAllForUser(userId: string, at: Date): Promise<number> {
      const result = await db.query(
        "UPDATE refresh_tokens SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL",
        [userId, at.toISOString()],
      )
      return result.rowCount ?? 0
    },
  }
}
