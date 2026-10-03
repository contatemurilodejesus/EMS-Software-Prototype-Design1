/**
 * Repositories EM MEMORIA - eventos de maquina, relacoes e analises de impacto
 * (secoes 11.1, 11.2 e 11.3).
 *
 * Todo filtro usa (tenantId, id): um id de outro tenant responde "nao encontrado"
 * (404), nunca "proibido" (403) - regra 7.1.3.
 */

import type { ImpactAnalysis, MachineEvent, MachineRelationship } from "../../../domain/entities/index.ts"
import type { RelationshipType } from "../../../domain/value-objects/index.ts"
import type {
  IImpactAnalysisRepository,
  IMachineEventRepository,
  IRelationshipRepository,
  ImpactAnalysisQuery,
  MachineEventQuery,
} from "../../../domain/ports/index.ts"
import { clone } from "../../../shared/utils/index.ts"
import { tenantFilter } from "./tenant-scope.ts"
import type { MemoryStore } from "./memory-state.ts"

export function createMemoryMachineEventRepository(store: MemoryStore): IMachineEventRepository {
  const { state } = store

  return {
    async list(tenantId: string, query: MachineEventQuery = {}): Promise<MachineEvent[]> {
      let list = tenantFilter(state.machineEvents).filter((e) => e.tenantId === tenantId).slice()

      if (query.machineId) list = list.filter((e) => e.machineId === query.machineId)
      if (query.type) list = list.filter((e) => e.type === query.type)
      if (query.severity) list = list.filter((e) => e.severity === query.severity)

      list.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      if (query.limit) list = list.slice(0, query.limit)

      return list.map(clone)
    },

    async findById(id: string, tenantId: string): Promise<MachineEvent | null> {
      const found = state.machineEvents.find((e) => e.id === id && e.tenantId === tenantId)
      return found ? clone(found) : null
    },

    async save(event: MachineEvent): Promise<MachineEvent> {
      state.eventSeq += 1
      state.machineEvents.push(clone(event))
      return clone(event)
    },
  }
}

export function createMemoryRelationshipRepository(store: MemoryStore): IRelationshipRepository {
  const { state } = store

  return {
    async list(tenantId: string): Promise<MachineRelationship[]> {
      return tenantFilter(state.relationships)
        .filter((r) => r.tenantId === tenantId)
        .map(clone)
    },

    async findById(id: string, tenantId: string): Promise<MachineRelationship | null> {
      const found = state.relationships.find((r) => r.id === id && r.tenantId === tenantId)
      return found ? clone(found) : null
    },

    async findUnique(
      tenantId: string,
      sourceMachineId: string,
      targetMachineId: string,
      relationshipType: RelationshipType,
    ): Promise<MachineRelationship | null> {
      const found = state.relationships.find(
        (r) =>
          r.tenantId === tenantId &&
          r.sourceMachineId === sourceMachineId &&
          r.targetMachineId === targetMachineId &&
          r.relationshipType === relationshipType,
      )
      return found ? clone(found) : null
    },

    async save(rel: MachineRelationship): Promise<MachineRelationship> {
      state.relationships.push(clone(rel))
      return clone(rel)
    },

    async update(
      id: string,
      tenantId: string,
      patch: Partial<MachineRelationship>,
    ): Promise<MachineRelationship | null> {
      const index = state.relationships.findIndex((r) => r.id === id && r.tenantId === tenantId)
      if (index < 0) return null
      state.relationships[index] = {
        ...state.relationships[index],
        ...clone(patch),
        id,
        tenantId,
      }
      return clone(state.relationships[index])
    },

    async remove(id: string, tenantId: string): Promise<boolean> {
      const index = state.relationships.findIndex((r) => r.id === id && r.tenantId === tenantId)
      if (index < 0) return false
      state.relationships.splice(index, 1)
      return true
    },
  }
}

export function createMemoryImpactAnalysisRepository(store: MemoryStore): IImpactAnalysisRepository {
  const { state } = store

  return {
    async list(tenantId: string, query: ImpactAnalysisQuery = {}): Promise<ImpactAnalysis[]> {
      let list = tenantFilter(state.impactAnalyses)
        .filter((a) => a.tenantId === tenantId)
        .slice()

      if (query.machineId) list = list.filter((a) => a.machineId === query.machineId)
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      if (query.limit) list = list.slice(0, query.limit)

      return list.map(clone)
    },

    async findById(id: string, tenantId: string): Promise<ImpactAnalysis | null> {
      const found = state.impactAnalyses.find((a) => a.id === id && a.tenantId === tenantId)
      return found ? clone(found) : null
    },

    async save(analysis: ImpactAnalysis): Promise<ImpactAnalysis> {
      state.impactAnalyses.push(clone(analysis))
      return clone(analysis)
    },
  }
}