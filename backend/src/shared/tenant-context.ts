/**
 * Contexto de TENANT por requisicao (secao 7.1 do documento).
 *
 * O tenant vem SEMPRE do token validado pelo middleware e e propagado por
 * AsyncLocalStorage - nunca de body, query ou header do cliente. Os
 * repositories leem `currentTenantId()` para aplicar o filtro em toda
 * consulta (secao 5.4).
 *
 * Justificativa tecnica (secao 16): em vez de assinar ~40 metodos de
 * service com tenantId, o filtro fica centralizado nos repositories com um
 * unico ponto de entrada confiavel. Jobs em segundo plano (scheduler,
 * ingestao) rodam com o tenant do demo explicito via `runWithActor`.
 */

import { AsyncLocalStorage } from "node:async_hooks"
import type { UserRole } from "../domain/value-objects/index.ts"

export interface ActorContext {
  tenantId: string
  userId: string
  role: UserRole
}

const storage = new AsyncLocalStorage<ActorContext>()

/** Executa `fn` com o ator autenticado no contexto (middleware/pipeline). */
export function runWithActor<T>(actor: ActorContext, fn: () => T): T {
  return storage.run(actor, fn)
}

export function currentActor(): ActorContext | null {
  return storage.getStore() ?? null
}

/**
 * Tenant da operacao corrente. Lança erro generico (401) quando nao ha
 * contexto - um endpoint sensivel sem autenticacao nunca chega aqui
 * (o middleware `authenticate` rejeita antes), mas a defesa fica no repo.
 */
export function currentTenantId(): string {
  const actor = storage.getStore()
  if (!actor) {
    throw new Error("TENANT_CONTEXT_MISSING: operacao sem contexto de tenant autenticado")
  }
  return actor.tenantId
}

/** Versao tolerante: null quando fora de requisicao (jobs sem contexto). */
export function currentTenantIdOrNull(): string | null {
  return storage.getStore()?.tenantId ?? null
}
