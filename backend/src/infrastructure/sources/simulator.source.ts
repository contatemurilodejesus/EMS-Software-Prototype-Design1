/**
 * FONTE DE TELEMETRIA SIMULADA (contrato de telemetria, secao 9).
 *
 * Substitui o "MQTT" do prototipo. A futura troca por medidores reais e uma
 * nova implementacao desta mesma interface (`TelemetrySource`), sem tocar em
 * dominio, analytics ou aplicacao.
 *
 * Determinismo: o ruido de sensor vem de `dnoise(passo, semente)` - nenhum
 * `Math.random()`. Zero NAO e ausencia: maquina desligada reporta 0 kW com
 * qualidade GOOD; ausencia de mensagem e MISSING (campos NULL).
 */

import type { MachineRecord, TelemetryReading } from "../../domain/entities/index.ts"
import type { Clock } from "../../domain/ports/index.ts"
import { dnoise, hashId } from "../../shared/utils/deterministic.ts"
import { classifyState, NOMINAL_VOLTAGE } from "../../analytics/index.ts"
import { classifyReadingQuality } from "../../analytics/quality.ts"
import { toNumber } from "../../shared/utils/index.ts"

export interface TelemetrySource {
  /** Le um lote de leituras (uma por maquina) para o passo informado. */
  read(step: number, machines: MachineRecord[]): TelemetryReading[]
}

export interface SimulatorSourceOptions {
  clock: Clock
  /** Semente base do ruido deterministico (troca de semente = outro cenario). */
  seed?: number
}

/** Aplica ruido deterministico proporcional (ex.: 0.004 = +-0,4%). */
function jitter(value: number, pct: number, step: number, seed: number): number {
  return value + value * pct * dnoise(step, seed)
}

export function createSimulatorSource(options: SimulatorSourceOptions): TelemetrySource {
  const seedBase = options.seed ?? 0

  return {
    read(step: number, machines: MachineRecord[]): TelemetryReading[] {
      const ts = options.clock.now()

      return machines.map((machine) => {
        const seed = hashId(machine.id) + seedBase
        const state = classifyState(machine.power, machine.pOff, machine.pRun)
        const off = state === "OFF"

        // Maquina desligada: 0 kW reportado (GOOD). Nao ha consumo a acumular.
        const powerKw = off ? 0 : Number(jitter(machine.power, 0.01, step, seed).toFixed(1))
        const voltageV = off
          ? NOMINAL_VOLTAGE
          : Math.round(jitter(toNumber(machine.voltage, NOMINAL_VOLTAGE), 0.004, step, seed + 17))
        const currentA = off ? 0 : Number(jitter(machine.current, 0.01, step, seed + 23).toFixed(1))
        const temperatureC = Math.round(jitter(machine.temperature, 0.002, step, seed + 7))
        const powerFactor = off ? 0 : Number(jitter(machine.powerFactor, 0.005, step, seed + 11).toFixed(2))

        return {
          machineId: machine.id,
          ts,
          powerKw,
          energyKwh: null, // acumulado pela ingestao
          voltageV,
          currentA,
          powerFactor,
          temperatureC,
          state,
          quality: classifyReadingQuality({ hasValue: !off }),
        }
      })
    },
  }
}