/**
 * Repositories EM MEMORIA - autenticacao e auditoria (secao 7).
 * Filtro de tenant aplicado em toda consulta (secao 7.1).
 */

import type {
  AuditLog,
  Invite,
  RefreshToken,
  Tenant,
  User,
} from "../../../domain/entities/index.ts"
import type {
  IAuditLogRepository,
  IInviteRepository,
  IRefreshTokenRepository,
  ITenantRepository,
  IUserRepository,
} from "../../../domain/ports/index.ts"
import { clone } from "../../../shared/utils/index.ts"
import type { MemoryStore } from "./memory-state.ts"

export function createMemoryTenantRepository(store: MemoryStore): ITenantRepository {
  const { state } = store
  return {
    async list(): Promise<Tenant[]> {
      return state.tenants.map(clone)
    },
    async findById(id: string): Promise<Tenant | null> {
      const found = state.tenants.find((t) => t.id === id)
      return found ? clone(found) : null
    },
    async findBySlug(slug: string): Promise<Tenant | null> {
      const found = state.tenants.find((t) => t.slug === slug)
      return found ? clone(found) : null
    },
    async save(tenant: Tenant): Promise<Tenant> {
      state.tenants.push(clone(tenant))
      return clone(tenant)
    },
    async update(id: string, patch: Partial<Tenant>): Promise<Tenant | null> {
      const index = state.tenants.findIndex((t) => t.id === id)
      if (index < 0) return null
      state.tenants[index] = { ...state.tenants[index], ...clone(patch), id }
      return clone(state.tenants[index])
    },
  }
}

export function createMemoryUserRepository(store: MemoryStore): IUserRepository {
  const { state } = store
  return {
    async list(tenantId: string): Promise<User[]> {
      return state.users.filter((u) => u.tenantId === tenantId).map(clone)
    },
    async findById(id: string, tenantId: string): Promise<User | null> {
      const found = state.users.find((u) => u.id === id && u.tenantId === tenantId)
      return found ? clone(found) : null
    },
    /** Login busca por e-mail (unico globalmente, D15) - antes do contexto. */
    async findByEmail(email: string): Promise<User | null> {
      const found = state.users.find((u) => u.email.toLowerCase() === email.toLowerCase())
      return found ? clone(found) : null
    },
    async countByRole(tenantId: string, role: User["role"]): Promise<number> {
      return state.users.filter((u) => u.tenantId === tenantId && u.role === role).length
    },
    async save(user: User): Promise<User> {
      state.users.push(clone(user))
      return clone(user)
    },
    async update(id: string, tenantId: string, patch: Partial<User>): Promise<User | null> {
      const index = state.users.findIndex((u) => u.id === id && u.tenantId === tenantId)
      if (index < 0) return null
      state.users[index] = { ...state.users[index], ...clone(patch), id, tenantId }
      return clone(state.users[index])
    },
  }
}

export function createMemoryInviteRepository(store: MemoryStore): IInviteRepository {
  const { state } = store
  return {
    async list(tenantId: string): Promise<Invite[]> {
      return state.invites.filter((i) => i.tenantId === tenantId).map(clone)
    },
    async findById(id: string, tenantId: string): Promise<Invite | null> {
      const found = state.invites.find((i) => i.id === id && i.tenantId === tenantId)
      return found ? clone(found) : null
    },
    async findByCodeHash(codeHash: string): Promise<Invite | null> {
      const found = state.invites.find((i) => i.codeHash === codeHash)
      return found ? clone(found) : null
    },
    async save(invite: Invite): Promise<Invite> {
      state.invites.push(clone(invite))
      return clone(invite)
    },
    async update(id: string, tenantId: string, patch: Partial<Invite>): Promise<Invite | null> {
      const index = state.invites.findIndex((i) => i.id === id && i.tenantId === tenantId)
      if (index < 0) return null
      state.invites[index] = { ...state.invites[index], ...clone(patch), id, tenantId }
      return clone(state.invites[index])
    },
  }
}

export function createMemoryRefreshTokenRepository(store: MemoryStore): IRefreshTokenRepository {
  const { state } = store
  return {
    async findByHash(tokenHash: string): Promise<RefreshToken | null> {
      const found = state.refreshTokens.find((t) => t.tokenHash === tokenHash)
      return found ? clone(found) : null
    },
    async save(token: RefreshToken): Promise<RefreshToken> {
      state.refreshTokens.push(clone(token))
      return clone(token)
    },
    async revoke(tokenHash: string, at: Date): Promise<boolean> {
      const found = state.refreshTokens.find((t) => t.tokenHash === tokenHash && !t.revokedAt)
      if (!found) return false
      found.revokedAt = at.toISOString()
      return true
    },
    async revokeAllForUser(userId: string, at: Date): Promise<number> {
      let count = 0
      for (const token of state.refreshTokens) {
        if (token.userId === userId && !token.revokedAt) {
          token.revokedAt = at.toISOString()
          count += 1
        }
      }
      return count
    },
  }
}

export function createMemoryAuditLogRepository(store: MemoryStore): IAuditLogRepository {
  const { state } = store
  return {
    async list(tenantId: string | null, limit = 100): Promise<AuditLog[]> {
      return state.auditLogs
        .filter((entry) => tenantId === null || entry.tenantId === tenantId)
        .slice(-limit)
        .reverse()
        .map(clone)
    },
    async append(entry: AuditLog): Promise<AuditLog> {
      state.auditLogs.push(clone(entry))
      return clone(entry)
    },
  }
}
