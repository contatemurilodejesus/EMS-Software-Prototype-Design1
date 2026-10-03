/**
 * Engine ANALITICO - Regra termica (limite + persistencia).
 *
 * O alerta so e emitido quando a temperatura permanece acima do limite pelo
 * tempo minimo (persistencia), evitando alarme por pico isolado de leitura.
 */

import type { Thresholds } from "../domain/entities/index.ts"
import { toNumber } from "../shared/utils/index.ts"

/** Persistencia minima (min) acima do limite para confirmar alerta termico. */
export const THERMAL_PERSISTENCE_MINUTES = 3

export interface ThermalSample {
  temperatureC: number | null
  at: Date
}

export interface ThermalResult {
  active: boolean
  peakC: number
  minutesAboveLimit: number
  thresholdC: number
  reason: string | null
}

/**
 * Avalia a janela de leituras recentes. Leituras MISSING (null) nao contam
 * como "acima do limite" nem zeram a persistencia acumulada anterior.
 */
export function thermalState(
  samples: ThermalSample[],
  thresholds: Thresholds,
  persistenceMinutes = THERMAL_PERSISTENCE_MINUTES,
): ThermalResult {
  const limit = thresholds.temperatureCriticalC
  const values = samples
    .map((s) => (s.temperatureC === null ? null : toNumber(s.temperatureC)))
    .filter((v): v is number => v !== null)

  const peakC = values.length ? Math.max(...values) : 0
  const minutesAboveLimit = values.filter((v) => v > limit).length
  const active = minutesAboveLimit >= persistenceMinutes

  return {
    active,
    peakC,
    minutesAboveLimit,
    thresholdC: limit,
    reason: active
      ? `Temperatura permaneceu acima de ${limit}°C por ${minutesAboveLimit} min (pico ${peakC}°C)`
      : null,
  }
}

/** Temperatura prevista no passo simulado (limite de rampa de 45°C). */
export function thermalRamp(baseTempC: number, step: number, maxRiseC = 45): number {
  return toNumber(baseTempC) + Math.min(maxRiseC, step * 2.5)
}