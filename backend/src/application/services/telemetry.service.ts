/**
 * Application service - TELEMETRIA e ANALYTICS por maquina.
 *
 * Para as 3 maquinas do Competition Mode a serie e determinística (passos);
 * para as demais, a curva de carga de 24 h coerente com o estado atual.
 */

import { NotFoundError, ERROR_CODES } from "../../domain/errors/index.ts"
import type { TelemetryReading } from "../../domain/entities/index.ts"
import type { DataQuality, TelemetrySource } from "../../domain/value-objects/index.ts"
import type { IngestionSummary } from "../../ingestion/ingestion.pipeline.ts"
import type { ServiceContext } from "../context.ts"
import type { MachineService } from "./machine.service.ts"
import type { ScenarioService } from "./scenario.service.ts"

export interface TelemetryDependencies {
  machines: MachineService
  scenarios: ScenarioService
  /** Passo de ingestao: fonte -> pipeline (o container monta as dependencias). */
  ingestStep: () => Promise<IngestionSummary | null>
  /**
   * Ingestao de leituras recebidas por HTTP/MQTT (D4/D19): mesmo
   * IngestionService dos dois caminhos, so muda a origem.
   */
  pipeline: { ingest(readings: TelemetryReading[]): Promise<IngestionSummary> }
}

/** Leitura vinda da API/MQTT: o tenant NUNCA vem do payload (D3/D4). */
interface IncomingReading {
  machineId?: unknown
  ts?: unknown
  powerKw?: unknown
  energyKwh?: unknown
  voltageV?: unknown
  currentA?: unknown
  powerFactor?: unknown
  temperatureC?: unknown
  quality?: unknown
  source?: unknown
  sensorId?: unknown
}

const NUMERIC = new Set([
  "powerKw",
  "energyKwh",
  "voltageV",
  "currentA",
  "powerFactor",
  "temperatureC",
])

/**
 * Normaliza o corpo de POST /api/telemetry no contrato de leitura.
 * `source` default REAL: quem chama via HTTP e o gateway (D7).
 */
export function normalizeReading(input: IncomingReading): TelemetryReading {
  const numbers: Record<string, number | null> = {}

  for (const field of NUMERIC) {
const raw = (input as Record<string, unknown>)[field]
    numbers[field] = raw === undefined || raw === null || raw === "" ? null : Number(raw)
  }

  return {
    machineId: String(input.machineId ?? ""),
    ts: input.ts ? new Date(String(input.ts)) : new Date(),
    powerKw: numbers.powerKw ?? 0,
    energyKwh: numbers.energyKwh,
    voltageV: numbers.voltageV,
    currentA: numbers.currentA,
    powerFactor: numbers.powerFactor,
    temperatureC: numbers.temperatureC,
    // `state` e DERIVADO pelo State Engine na ingestao; a fonte nao define.
    state: "RUNNING",
    quality: (input.quality as DataQuality) ?? "GOOD",
    source: (input.source as TelemetrySource) ?? "REAL",
    sensorId: input.sensorId ? String(input.sensorId) : null,
  }
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

  /**
   * Ingere leituras vindas de HTTP/MQTT pelo MESMO pipeline do simulador
   * (D19). O tenant vem do contexto autenticado - o payload nao define.
   */
  async function ingest(input: unknown[]): Promise<IngestionSummary> {
    const readings = (input ?? []).map((item) =>
      normalizeReading((item ?? {}) as IncomingReading),
    )

    if (!readings.length) {
      return {
        received: 0,
        persisted: 0,
        duplicated: 0,
        unresolved: 0,
        invalid: 0,
        missing: 0,
        alertsOpened: 0,
        states: {},
      }
    }

    const summary = await deps.pipeline.ingest(readings)
    log.info("Telemetria ingerida via API", {
      received: summary.received,
      persisted: summary.persisted,
      duplicated: summary.duplicated,
      unresolved: summary.unresolved,
    })
    return summary
  }

  return { machineTelemetry, machineAnalytics, tick, ingest }
}

export type TelemetryService = ReturnType<typeof createTelemetryService>