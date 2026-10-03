/**
 * Repository EM MEMORIA - maquinas e telemetria.
 *
 * Implementam os ports do dominio sem PostgreSQL. A chave de deduplicacao
 * da telemetria e (machineId, ts) - mesma semantica da PK composta no banco.
 */

import type { MachineRecord, ReadingsCounters, TelemetryReading } from "../../../domain/entities/index.ts"
import type { DataQuality } from "../../../domain/value-objects/index.ts"
import type {
  IMachineRepository,
  ITelemetryRepository,
  MachineQuery,
  TelemetryQuery,
} from "../../../domain/ports/index.ts"
import { clone } from "../../../shared/utils/index.ts"
import { belongsToTenant, tenantFilter } from "./tenant-scope.ts"
import type { MemoryStore } from "./memory-state.ts"

export function createMemoryMachineRepository(store: MemoryStore): IMachineRepository {
  const { state } = store

  return {
    /** `tenantFilter` aplica o tenant do contexto autenticado (secao 7.1). */
    async list(query: MachineQuery = {}): Promise<MachineRecord[]> {
      let list = tenantFilter(state.machines).map(clone)
      if (query.sector) list = list.filter((m) => m.sector === query.sector)
      return list
    },

    async findById(id: string): Promise<MachineRecord | null> {
      const found = state.machines.find((m) => m.id === id && belongsToTenant(m))
      return found ? clone(found) : null
    },

    async count(): Promise<number> {
      return tenantFilter(state.machines).length
    },

    async save(machine: MachineRecord): Promise<MachineRecord> {
      state.machines.push(clone(machine))
      return clone(machine)
    },

    async update(id: string, patch: Partial<MachineRecord>): Promise<MachineRecord | null> {
      const index = state.machines.findIndex((m) => m.id === id && belongsToTenant(m))
      if (index < 0) return null
      const current = state.machines[index]
      state.machines[index] = { ...current, ...clone(patch), id: current.id }
      return clone(state.machines[index])
    },

    async remove(id: string): Promise<boolean> {
      const index = state.machines.findIndex((m) => m.id === id && belongsToTenant(m))
      if (index < 0) return false
      state.machines.splice(index, 1)
      return true
    },
  }
}

export function createMemoryTelemetryRepository(store: MemoryStore): ITelemetryRepository {
  const { state } = store

  return {
    /** Retorna false quando a leitura e duplicada - chave (machineId, ts). */
    async append(reading: TelemetryReading): Promise<boolean> {
      const duplicate = state.telemetry.some(
        (r) => r.machineId === reading.machineId && r.ts.getTime() === reading.ts.getTime(),
      )
      if (duplicate) {
        state.readings.duplicate += 1
        return false
      }
      state.telemetry.push({ ...reading, ts: new Date(reading.ts) })
      return true
    },

    async listByMachine(query: TelemetryQuery): Promise<TelemetryReading[]> {
      // A maquina ja e filtrada por tenant em `machines.findById`; aqui o filtro
      // garante que leituras de maquinas de outro tenant nunca saiam na API.
      const machine = state.machines.find((m) => m.id === query.machineId)
      if (!machine || !belongsToTenant(machine)) return []

      let list = state.telemetry
        .filter((r) => r.machineId === query.machineId)
        .slice()
        .sort((a, b) => a.ts.getTime() - b.ts.getTime())

      if (query.from) list = list.filter((r) => r.ts.getTime() >= query.from!.getTime())
      if (query.to) list = list.filter((r) => r.ts.getTime() <= query.to!.getTime())
      if (query.limit && list.length > query.limit) list = list.slice(-query.limit)

      return list.map((r) => ({ ...r, ts: new Date(r.ts) }))
    },

    async count(): Promise<number> {
      return state.telemetry.length
    },

    async recordQuality(quality: DataQuality): Promise<ReadingsCounters> {
      if (quality === "GOOD") state.readings.good += 1
      else if (quality === "MISSING") state.readings.missing += 1
      else if (quality === "OUTLIER") state.readings.outlier += 1
      else state.readings.duplicate += 1
      return clone(state.readings)
    },
  }
}