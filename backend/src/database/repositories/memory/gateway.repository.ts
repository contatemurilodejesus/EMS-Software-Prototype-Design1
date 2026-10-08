/**
 * Repository EM MEMORIA - heartbeat de gateways (secao 11).
 *
 * O isolamento real por tenant vale no PostgreSQL (`gateways.tenant_id` +
 * RLS); a entidade Gateway do modo demo nao carrega tenantId, entao o
 * correspondente aqui e por identificador - limitacao documentada.
 */
import type { IGatewayRepository } from "../../../domain/ports/index.ts"
import type { MemoryStore } from "./memory-state.ts"

export function createMemoryGatewayRepository(store: MemoryStore): IGatewayRepository {
  const { state } = store

  return {
    async heartbeat(identifier: string, at: Date): Promise<boolean> {
      const gateway = state.gateways.find((g) => g.id === identifier || g.identifier === identifier)
      if (!gateway) return false
      gateway.status = "online"
      gateway.lastSeenAt = at.toISOString()
      return true
    },
  }
}