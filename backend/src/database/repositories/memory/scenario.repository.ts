/**
 * Repository EM MEMORIA - Competition Mode (cenario determinístico).
 *
 * O estado do cenario vive no simulador (tempo virtual). Ativar/resetar o
 * cenario e uma operacao composta: no adaptador PostgreSQL ela roda em
 * transacao (scenarios + alerts + interventions).
 */

import type {
  Alert,
  CompetitionInterventionRecord,
  CompetitionSnapshot,
  CompetitionTelemetryPoint,
} from "../../../domain/entities/index.ts"
import type { IScenarioRepository } from "../../../domain/ports/index.ts"
import type { ScenarioId } from "../../../domain/value-objects/index.ts"
import type { MemoryStore } from "./memory-state.ts"

export function createMemoryScenarioRepository(store: MemoryStore): IScenarioRepository {
  const { state } = store
  const simulator = state.simulator

  function snapshot(): CompetitionSnapshot {
    const status = simulator.status()
    return {
      scenario: status.scenario,
      step: status.step,
      simulated: status.simulated,
      deterministic: status.deterministic,
      scenarioLabel: status.scenarioLabel,
      targetMachine: status.targetMachine,
      note: status.note,
      scenarios: status.scenarios,
      kpis: status.kpis,
      alerts: status.alerts,
      interventions: status.interventions,
      beforeAfter: status.beforeAfter,
      machines: simulator.machines(),
      analytics: simulator.analytics(),
    }
  }

  return {
    async snapshot(): Promise<CompetitionSnapshot> {
      return snapshot()
    },

    async setScenario(scenario: ScenarioId): Promise<CompetitionSnapshot> {
      simulator.reset(scenario)
      return snapshot()
    },

    async step(): Promise<CompetitionSnapshot> {
      simulator.step()
      return snapshot()
    },

    async reset(): Promise<CompetitionSnapshot> {
      simulator.reset("NORMAL")
      return snapshot()
    },

    async telemetry(machineId: string): Promise<CompetitionTelemetryPoint[] | null> {
      return simulator.telemetry(machineId)
    },

    async addIntervention(input: {
      machineId?: string
      before: number
      after: number
    }): Promise<CompetitionInterventionRecord> {
      return simulator.addIntervention(input)
    },

    async advanceAlert(id: string): Promise<Alert | null> {
      return simulator.advanceAlert(id)
    },
  }
}