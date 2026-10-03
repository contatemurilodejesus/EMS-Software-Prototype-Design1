/**
 * Engine ANALITICO - Energia e Custo (secao 11).
 *
 * Energia: kWh_final - kWh_inicial.
 * Custo: energia x tarifa (perfil horario ANEEL do setor industrial).
 * Todos os valores economicos sao ESTIMATIVAS do cenario simulado.
 */

import type { Tariff } from "../domain/entities/index.ts"
import { toNumber } from "../shared/utils/index.ts"

/** Tarifa horaria ANEEL (R$/kWh) - perfil padrao industrial. */
export const DEFAULT_TARIFF: Tariff = {
  offPeak: 0.42,
  intermediate: 0.78,
  peak: 2.21,
  contractedDemandKW: 480,
  excessDemandPenalty: 45.8,
  schedule: {
    offPeak: [
      [0, 17],
      [21, 24],
    ],
    intermediate: [
      [17, 18],
      [21, 22],
    ],
    peak: [[18, 21]],
  },
}

export type TariffPeriod = "offPeak" | "intermediate" | "peak"

function inRanges(hour: number, ranges: number[][]): boolean {
  return ranges.some(([a, b]) => hour >= toNumber(a) && hour < toNumber(b))
}

/** Faixa tarifaria de uma hora (0-23). */
export function tariffPeriodForHour(hour: number, tariff: Tariff = DEFAULT_TARIFF): TariffPeriod {
  const h = ((toNumber(hour) % 24) + 24) % 24
  const schedule = tariff.schedule ?? DEFAULT_TARIFF.schedule!
  if (inRanges(h, schedule.peak)) return "peak"
  if (inRanges(h, schedule.intermediate)) return "intermediate"
  return "offPeak"
}

/** Tarifa (R$/kWh) de uma hora (0-23). */
export function rateForHour(hour: number, tariff: Tariff = DEFAULT_TARIFF): number {
  return toNumber(tariff[tariffPeriodForHour(hour, tariff)])
}

/** Tarifa media ponderada das 24 h - base das estimativas de custo. */
export function blendedRate(tariff: Tariff = DEFAULT_TARIFF): number {
  let sum = 0
  for (let h = 0; h < 24; h += 1) sum += rateForHour(h, tariff)
  return sum / 24
}

/** Energia consumida em um periodo: kWh_final - kWh_inicial. */
export function energyForPeriod(energyStartKwh: number, energyEndKwh: number): number {
  return Number((toNumber(energyEndKwh) - toNumber(energyStartKwh)).toFixed(3))
}

export interface LoadPointInput {
  hour?: number
  kwh?: number
}

/** Custo total (R$) de uma serie de consumo (kWh) por hora do dia. */
export function costFromLoad(
  series: LoadPointInput[] | null | undefined,
  tariff: Tariff = DEFAULT_TARIFF,
): number {
  return (series ?? []).reduce((acc, point, index) => {
    const hour = typeof point?.hour === "number" ? point.hour : index
    return acc + toNumber(point?.kwh) * rateForHour(hour, tariff)
  }, 0)
}

/** Custo estimado (R$) de um consumo (kWh) pela tarifa media ponderada. */
export function costOfEnergy(kwh: number, tariff: Tariff = DEFAULT_TARIFF): number {
  return Math.round(toNumber(kwh) * blendedRate(tariff))
}

/** Excedente de demanda contratada (kW) e penalidade estimada (R$). */
export function demandExcess(
  peakDemandKW: number,
  tariff: Tariff = DEFAULT_TARIFF,
): { excessKW: number; penaltyBrl: number } {
  const excessKW = Math.max(0, toNumber(peakDemandKW) - toNumber(tariff.contractedDemandKW))
  return {
    excessKW: Number(excessKW.toFixed(1)),
    penaltyBrl: Math.round(excessKW * toNumber(tariff.excessDemandPenalty)),
  }
}