/**
 * Repositories EM MEMORIA - alertas e intervencoes.
 */

import type { Alert, Intervention } from "../../../domain/entities/index.ts"
import type { AlertQuery, IAlertRepository, IInterventionRepository } from "../../../domain/ports/index.ts"
import { clone, formatDateTime } from "../../../shared/utils/index.ts"
import type { MemoryStore } from "./memory-state.ts"

export function createMemoryAlertRepository(store: MemoryStore): IAlertRepository {
  const { state } = store

  return {
    async list(query: AlertQuery = {}): Promise<Alert[]> {
      let list = state.alerts.map(clone)
      if (query.severity && query.severity !== "all") {
        list = list.filter((a) => a.severity === query.severity)
      }
      if (query.status && query.status !== "all") {
        list = list.filter((a) => a.status === query.status)
      }
      return list
    },

    async findById(id: string): Promise<Alert | null> {
      const found = state.alerts.find((a) => a.id === id)
      return found ? clone(found) : null
    },

    async countOpen(): Promise<number> {
      return state.alerts.filter((a) => a.status !== "resolved").length
    },

    async save(alert: Alert): Promise<Alert> {
      state.alerts.unshift(clone(alert))
      return clone(alert)
    },

    async update(id: string, patch: Partial<Alert>): Promise<Alert | null> {
      const index = state.alerts.findIndex((a) => a.id === id)
      if (index < 0) return null
      state.alerts[index] = { ...state.alerts[index], ...clone(patch), id }
      return clone(state.alerts[index])
    },
  }
}

export function createMemoryInterventionRepository(store: MemoryStore): IInterventionRepository {
  const { state } = store

  return {
    async list(): Promise<Intervention[]> {
      return state.interventions.map(clone)
    },

    async save(intervention: Intervention): Promise<Intervention> {
      state.interventions.unshift(clone(intervention))
      return clone(intervention)
    },
  }
}

/** Sequencial de alertas (ALT-2026-NNNN) a partir do estado atual. */
export function nextAlertSequence(store: MemoryStore): number {
  const { state } = store
  return state.alertSeq + state.alerts.filter((a) => a.id.startsWith("ALT-2026-")).length
}

/** Marca de deteccao no formato do contrato (dd/mm/aaaa hh:mm). */
export function detectionStamp(now: Date): string {
  return formatDateTime(now)
}