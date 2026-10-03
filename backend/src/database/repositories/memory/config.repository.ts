/**
 * Repositories EM MEMORIA - configuracao (tarifas, limiares, turnos) e
 * cadastro (plantas/setores). Espelha o que no PostgreSQL serao as tabelas
 * `tariffs`, `thresholds`, `shifts`, `plants` e `sectors`.
 */

import type { GatewayHealth, Plant, SectorMeta, Shift, Tariff, Thresholds } from "../../../domain/entities/index.ts"
import type { IConfigRepository, IPlantRepository } from "../../../domain/ports/index.ts"
import { clone, toNumber } from "../../../shared/utils/index.ts"
import type { MemoryStore } from "./memory-state.ts"

const TARIFF_KEYS = [
  "offPeak",
  "intermediate",
  "peak",
  "contractedDemandKW",
  "excessDemandPenalty",
] as const

export function createMemoryConfigRepository(store: MemoryStore): IConfigRepository {
  const { state } = store

  return {
    async getTariff(): Promise<Tariff> {
      return clone(state.tariff)
    },

    async setTariff(patch: Partial<Tariff>): Promise<Tariff> {
      for (const key of TARIFF_KEYS) {
        const value = patch[key]
        if (value !== undefined) state.tariff[key] = toNumber(value)
      }
      return clone(state.tariff)
    },

    async getThresholds(): Promise<Thresholds> {
      return clone(state.thresholds)
    },

    async setThresholds(patch: Partial<Thresholds>): Promise<Thresholds> {
      for (const key of Object.keys(state.thresholds) as (keyof Thresholds)[]) {
        const value = patch[key]
        if (value !== undefined) state.thresholds[key] = toNumber(value)
      }
      return clone(state.thresholds)
    },

    async listShifts(): Promise<Shift[]> {
      return clone(state.shifts)
    },

    async toggleShift(id: string): Promise<Shift | null> {
      const shift = state.shifts.find((s) => s.id === id)
      if (!shift) return null
      shift.active = !shift.active
      return clone(shift)
    },

    async listGatewayHealth(): Promise<GatewayHealth[]> {
      return clone(state.gatewayHealth)
    },
  }
}

export function createMemoryPlantRepository(store: MemoryStore): IPlantRepository {
  const { state } = store

  return {
    async list(): Promise<Plant[]> {
      return clone(state.plants)
    },

    async listSectorMeta(): Promise<SectorMeta[]> {
      return clone(state.sectorMeta)
    },
  }
}