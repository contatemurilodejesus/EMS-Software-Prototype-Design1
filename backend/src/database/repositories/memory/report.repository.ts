/**
 * Repository EM MEMORIA - read models de relatorios/dashboard.
 * No PostgreSQL estas consultas viram agregacoes SQL (ver database/migrations).
 */

import type { ConsumptionPoint, Gateway, GatewayHealth, ReadingsCounters } from "../../../domain/entities/index.ts"
import type { IReportRepository, JsonRow } from "../../../domain/ports/index.ts"
import { clone } from "../../../shared/utils/index.ts"
import type { MemoryStore } from "./memory-state.ts"

export function createMemoryReportRepository(store: MemoryStore): IReportRepository {
  const { state } = store

  return {
    async readings(): Promise<ReadingsCounters> {
      return clone(state.readings)
    },

    async consumptionSeries(): Promise<ConsumptionPoint[]> {
      return clone(state.consumptionSeries)
    },

    async shiftSeries(): Promise<JsonRow[]> {
      return clone(state.shiftData)
    },

    async costTrend(): Promise<JsonRow[]> {
      return clone(state.costTrend)
    },

    async machineBreakdown(): Promise<JsonRow[]> {
      return clone(state.machineBreakdown)
    },

    async tariffProfile(): Promise<JsonRow[]> {
      return clone(state.tariffProfile)
    },

    async opportunities(): Promise<JsonRow[]> {
      return clone(state.opportunities)
    },

    async gateways(): Promise<Gateway[]> {
      return clone(state.gateways)
    },

    async gatewayHealth(): Promise<GatewayHealth[]> {
      return clone(state.gatewayHealth)
    },

    async nonMonitoredKwhDay(): Promise<number> {
      return state.nonMonitoredKwhDay
    },
  }
}