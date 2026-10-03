/**
 * Application service - TELEMETRIA e ANALYTICS por maquina.
 *
 * Para as 3 maquinas do Competition Mode a serie e determinística (passos);
 * para as demais, a curva de carga de 24 h coerente com o estado atual.
 */

import { NotFoundError, ERROR_CODES } from "../../domain/errors/index.ts"
import type { IngestionSummary } from "../../ingestion/ingestion.pipeline.ts"
import type { ServiceContext } from "../context.ts"
import type { MachineService } from "./machine.service.ts"
import type { ScenarioService } from "./scenario.service.ts"

export interface TelemetryDependencies {
  machines: MachineService
  scenarios: ScenarioService
  /** Passo de ingestao: fonte -> pipeline (o container monta as dependencias). */
  ingestStep: () => Promise<IngestionSummary | null>
}

export function createTelemetryService(ctx: ServiceContext, deps: TelemetryDependencies) {
  const log = ctx.logger.child({ service: "TelemetryService" })

  /** Historico de telemetria (demo determinístico ou curva de carga). */
  async function machineTelemetry(id: string) {
    const demoPoints = await ctx.scenarios.telemetry(id)
    if (demoPoints) {
      return { machineId: id, simulated: true, points: demoPoints }
    }

    const machine = await deps.machines.findById(id)
    if (!machine) {
      throw new NotFoundError(`Máquina ${id} não encontrada`, ERROR_CODES.MACHINE_NOT_FOUND)
    }

    return {
      machineId: id,
      simulated: false,
      points: deps.machines.loadCurve(machine),
    }
  }

  /** Analytics da maquina: desvio, IDLE e anomalias com evidencia. */
  async function machineAnalytics(id: string) {
    const snapshot = await deps.scenarios.competition()
    const machine = snapshot.machines.find((m) => m.id === id)

    if (!machine) {
      return {
        machineId: id,
        simulated: false,
        note: "Sem analytics determinístico para esta máquina",
      }
    }

    const analytics = snapshot.analytics as unknown as {
      idle?: { machines?: { machineId: string }[] }
      anomalies?: { machineId: string }[]
    }

    const idleEntry = analytics.idle?.machines?.find((m) => m.machineId === id) ?? null
    const anomalies = (analytics.anomalies ?? []).filter((a) => a.machineId === id)

    return {
      machineId: id,
      simulated: true,
      state: machine.state,
      quality: machine.quality,
      powerKw: machine.power,
      baselineKw: machine.baselineKw,
      deviationPct: machine.deviationPct,
      idle: idleEntry,
      anomalies,
    }
  }

  /** Forca um passo de telemetria (POST /api/sim/tick). */
  async function tick(): Promise<IngestionSummary | null> {
    const summary = await deps.ingestStep()
    if (summary) {
      log.debug("Passo de telemetria forcado", {
        received: summary.received,
        persisted: summary.persisted,
      })
    }
    return summary
  }

  return { machineTelemetry, machineAnalytics, tick }
}

export type TelemetryService = ReturnType<typeof createTelemetryService>