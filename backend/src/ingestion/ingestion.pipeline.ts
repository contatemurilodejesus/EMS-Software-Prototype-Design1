/**
 * EnergyMatrix EMS - PIPELINE DE INGESTAO (secao 10 do documento).
 *
 *   fonte -> contrato de telemetria -> INGESTAO
 *     validar -> resolver code->id -> deduplicar -> persistir -> analytics
 *     -> alertas (MESMA transacao)
 *
 * Nao passa por controllers HTTP: e o mesmo caminho que a futura entrada MQTT
 * usara. Depende apenas de ports (machines, telemetry, config, unitOfWork).
 */

import { resolveState, describeAnomalies } from "../analytics/state.ts"
import { isUsableInAnalytics } from "../analytics/quality.ts"
import { energyFromPower } from "../analytics/energy.ts"
import { formatTime, toNumber } from "../shared/utils/index.ts"
import type { Alert, Anomaly, MachineRecord, TelemetryReading } from "../domain/entities/index.ts"
import type { DataQuality, MachineState } from "../domain/value-objects/index.ts"
import type {
  Clock,
  IConfigRepository,
  IMachineRepository,
  IMachineStateRepository,
  ITelemetryRepository,
  Logger,
  UnitOfWork,
} from "../domain/ports/index.ts"

/** Porta de saida para alertas (implementada por AlertService). */
export interface AlertSink {
  openFromAnomaly(input: {
    machine: MachineRecord
    state: MachineState
    anomalies: Anomaly[]
    at: Date
  }): Promise<Alert | null>
}

export interface IngestionDeps {
  machines: IMachineRepository
  machineStates: IMachineStateRepository
  telemetry: ITelemetryRepository
  config: IConfigRepository
  unitOfWork: UnitOfWork
  clock: Clock
  logger: Logger
  alertSink: AlertSink
}

export interface IngestionSummary {
  received: number
  persisted: number
  duplicated: number
  unresolved: number
  invalid: number
  missing: number
  alertsOpened: number
  states: Record<string, MachineState>
}

interface ValidatedReading {
  valid: boolean
  quality: DataQuality
}

/** Validacao: tipos, limites e a regra "zero nao e ausencia". */
function validateReading(reading: TelemetryReading): ValidatedReading {
  const numbers = [
    reading.powerKw,
    reading.energyKwh,
    reading.voltageV,
    reading.currentA,
    reading.powerFactor,
    reading.temperatureC,
  ]

  if (!reading.machineId || Number.isNaN(new Date(reading.ts).getTime())) {
    return { valid: false, quality: "MISSING" }
  }

  const anyFinite = numbers.some((value) => value !== null && Number.isFinite(value))
  const hasNonFinite = numbers.some((value) => value !== null && !Number.isFinite(value))

  if (!anyFinite) return { valid: true, quality: "MISSING" }
  if (hasNonFinite) return { valid: true, quality: "OUTLIER" }

  const temperature = reading.temperatureC
  if (temperature !== null && (temperature < -50 || temperature > 400)) {
    return { valid: true, quality: "OUTLIER" }
  }

  return { valid: true, quality: reading.quality ?? "GOOD" }
}

export function createIngestionPipeline(deps: IngestionDeps) {
  const log = deps.logger.child({ layer: "ingestion" })

  async function ingest(readings: TelemetryReading[]): Promise<IngestionSummary> {
    const now = deps.clock.now()
    const thresholds = await deps.config.getThresholds()

    const summary: IngestionSummary = {
      received: readings.length,
      persisted: 0,
      duplicated: 0,
      unresolved: 0,
      invalid: 0,
      missing: 0,
      alertsOpened: 0,
      states: {},
    }

    await deps.unitOfWork.transaction(async () => {
      for (const reading of readings) {
        const machine = await deps.machines.findById(reading.machineId)

        if (!machine) {
          summary.unresolved += 1
          log.warn("Leitura de maquina desconhecida", { machineId: reading.machineId })
          await deps.telemetry.recordQuality("MISSING")
          continue
        }

        const validation = validateReading(reading)
        if (!validation.valid) {
          summary.invalid += 1
          await deps.telemetry.recordQuality("MISSING")
          continue
        }

        const stored = await deps.telemetry.append({
          ...reading,
          quality: validation.quality,
        })
        if (!stored) {
          summary.duplicated += 1
          continue
        }

        await deps.telemetry.recordQuality(validation.quality)
        if (validation.quality === "MISSING") summary.missing += 1

        const previous = await deps.machineStates.current(machine.id)
        const online = validation.quality !== "MISSING"

        const derived = resolveState(
          {
            power: reading.powerKw ?? 0,
            pOff: machine.pOff,
            pRun: machine.pRun,
            temperature: reading.temperatureC ?? machine.temperature,
            powerFactor: reading.powerFactor ?? machine.powerFactor,
            voltage: reading.voltageV ?? machine.voltage,
            current: reading.currentA ?? machine.current,
            nominalKW: machine.nominalKW,
            online,
          },
          thresholds,
          previous?.state,
        )

        const usable = isUsableInAnalytics(validation.quality)
        const consumption = usable
          ? Number((machine.consumption + energyFromPower(reading.powerKw ?? 0)).toFixed(1))
          : machine.consumption

        const idleMinutes =
          derived.state === "IDLE" ? toNumber(machine.idleMinutes) + (online ? 1 : 0) : 0

        await deps.machines.update(machine.id, {
          power: reading.powerKw ?? machine.power,
          voltage: reading.voltageV ?? machine.voltage,
          current: reading.currentA ?? machine.current,
          powerFactor: reading.powerFactor ?? machine.powerFactor,
          temperature: reading.temperatureC ?? machine.temperature,
          consumption,
          idleMinutes,
          lastUpdate: formatTime(now),
          quality: validation.quality,
          online,
        })

        await deps.machineStates.openInterval(machine.id, derived.state, reading.ts)

        summary.persisted += 1
        summary.states[machine.id] = derived.state

        if (derived.state === "ANOMALY" && previous?.state !== "ANOMALY") {
          const alert = await deps.alertSink.openFromAnomaly({
            machine,
            state: derived.state,
            anomalies: derived.anomalies,
            at: now,
          })
          if (alert) {
            summary.alertsOpened += 1
            log.info("Alerta aberto pela ingestao", {
              machineId: machine.id,
              anomaly: describeAnomalies(derived.anomalies),
            })
          }
        }
      }
    })

    return summary
  }

  return { ingest }
}

export type IngestionPipeline = ReturnType<typeof createIngestionPipeline>