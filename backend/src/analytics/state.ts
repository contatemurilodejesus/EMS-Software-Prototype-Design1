/**
 * Engine ANALITICO - Estado da maquina (secao 11).
 *
 * Regra: limiar de potencia + duracao minima + histerese.
 *   OFF     -> P <= P_off
 *   IDLE    -> P_off < P < P_run
 *   RUNNING -> P >= P_run
 * ANOMALY e aplicado por cima quando ha anomalia critica.
 */

import type { Anomaly, MachineSignal, Thresholds } from "../domain/entities/index.ts"
import type { MachineState } from "../domain/value-objects/index.ts"
import { toNumber } from "../shared/utils/index.ts"
import { DEFAULT_THRESHOLDS, detectAnomalies } from "./anomaly.ts"

/** Banda de histerese (kW) em torno de P_off/P_run - evita oscilacao de estado. */
export const DEFAULT_HYSTERESIS_KW = 0.15

/** Duracao minima (min) para confirmar a troca de estado do motor. */
export const DEFAULT_MIN_DURATION_MINUTES = 1

export interface StateEngineOptions {
  thresholds?: Thresholds
  hysteresisKw?: number
  minDurationMinutes?: number
}

/** Classificacao instantanea a partir da potencia ativa (kW). */
export function classifyState(power: number, pOff: number, pRun: number): MachineState {
  const p = toNumber(power)
  if (p <= toNumber(pOff)) return "OFF"
  if (p < toNumber(pRun)) return "IDLE"
  return "RUNNING"
}

/**
 * Classificacao com histerese: mantem o estado anterior enquanto o desvio
 * estiver dentro da banda, evitando trocas espurias em torno dos limiares.
 */
export function classifyStateWithHysteresis(
  power: number,
  pOff: number,
  pRun: number,
  previous: MachineState | undefined,
  hysteresisKw = DEFAULT_HYSTERESIS_KW,
): MachineState {
  const raw = classifyState(power, pOff, pRun)
  if (!previous || raw === previous) return raw

  const p = toNumber(power)
  const off = toNumber(pOff)
  const run = toNumber(pRun)

  if (previous === "OFF" && raw === "IDLE" && p < off + hysteresisKw) return "OFF"
  if (previous === "IDLE" && raw === "OFF" && p > off - hysteresisKw) return "IDLE"
  if (previous === "RUNNING" && raw === "IDLE" && p > run - hysteresisKw) return "RUNNING"
  if (previous === "IDLE" && raw === "RUNNING" && p < run + hysteresisKw) return "IDLE"
  return raw
}

/**
 * Estado final da maquina: base (com histerese) + anomalias ativas.
 * Retorna tambem as anomalias, para que a evidencia acompanhe o estado.
 */
export function resolveState(
  signal: MachineSignal,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
  previous?: MachineState,
  options: { hysteresisKw?: number } = {},
): { state: MachineState; anomalies: Anomaly[] } {
  const base = classifyStateWithHysteresis(
    signal.power,
    signal.pOff,
    signal.pRun,
    previous,
    options.hysteresisKw,
  )
  const anomalies = detectAnomalies(signal, thresholds)
  const hasCritical = anomalies.some((a) => a.severity === "critical")
  return { state: hasCritical ? "ANOMALY" : base, anomalies }
}

/** Descricao consolidada das anomalias (campo `anomalyDesc` do contrato). */
export function describeAnomalies(anomalies: Anomaly[]): string | undefined {
  if (!anomalies.length) return undefined
  return anomalies.map((a) => a.desc).join(" · ")
}