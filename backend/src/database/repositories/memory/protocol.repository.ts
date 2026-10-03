/**
 * Repository EM MEMORIA - modulo protocolar.
 * Filtros derivados (SLA) sao aplicados na aplicacao, apos a decoracao.
 */

import type { Protocol, ProtocolEvent } from "../../../domain/entities/index.ts"
import type { IProtocolRepository, ProtocolQuery } from "../../../domain/ports/index.ts"
import { nextSequence as nextProtocolSequence } from "../../../domain/protocol/rules.ts"
import { clone } from "../../../shared/utils/index.ts"
import type { MemoryStore } from "./memory-state.ts"

export function createMemoryProtocolRepository(store: MemoryStore): IProtocolRepository {
  const { state } = store

  return {
    async list(query: ProtocolQuery = {}): Promise<Protocol[]> {
      let list = state.protocols.map(clone)
      if (query.status && query.status !== "all") {
        list = list.filter((p) => p.status === query.status)
      }
      if (query.priority && query.priority !== "all") {
        list = list.filter((p) => p.priority === query.priority)
      }
      return list
    },

    async findById(id: string): Promise<Protocol | null> {
      const found = state.protocols.find((p) => p.id === id)
      return found ? clone(found) : null
    },

    async nextSequence(year: number): Promise<number> {
      return nextProtocolSequence(state.protocols, year)
    },

    async save(protocol: Protocol): Promise<Protocol> {
      state.protocols.unshift(clone(protocol))
      return clone(protocol)
    },

    async update(id: string, patch: Partial<Protocol>): Promise<Protocol | null> {
      const index = state.protocols.findIndex((p) => p.id === id)
      if (index < 0) return null
      state.protocols[index] = { ...state.protocols[index], ...clone(patch), id }
      return clone(state.protocols[index])
    },

    async appendEvent(id: string, event: ProtocolEvent): Promise<Protocol | null> {
      const index = state.protocols.findIndex((p) => p.id === id)
      if (index < 0) return null
      state.protocols[index].events.push(clone(event))
      return clone(state.protocols[index])
    },
  }
}