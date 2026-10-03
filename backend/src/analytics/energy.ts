/**
 * Engine ANALITICO - Acumulacao de energia.
 *
 * kWh = potencia (kW) x tempo (h). Sem dependencia de relogio: o intervalo
 * e sempre parametro explicito (o simulador usa tempo virtual de 1 min).
 */

import { toNumber } from "../shared/utils/index.ts"

/** Energia incremental (kWh) de um intervalo. */
export function energyFromPower(powerKw: number, minutes = 1): number {
  return Number(((toNumber(powerKw) / 60) * minutes).toFixed(3))
}

/** Acumula energia mantendo 3 casas decimais (contrato do simulador). */
export function accumulateEnergy(previousKwh: number, powerKw: number, minutes = 1): number {
  return Number((toNumber(previousKwh) + energyFromPower(powerKw, minutes)).toFixed(3))
}

/** Energia do periodo: kWh_final - kWh_inicial. */
export function periodEnergyKwh(energyStartKwh: number, energyEndKwh: number): number {
  return Number((toNumber(energyEndKwh) - toNumber(energyStartKwh)).toFixed(3))
}

/** Potencia media (kW) de uma serie de leituras utilizaveis. */
export function averagePowerKw(values: (number | null)[]): number {
  const usable = values.filter((v): v is number => v !== null).map((v) => toNumber(v))
  if (!usable.length) return 0
  return Number((usable.reduce((s, v) => s + v, 0) / usable.length).toFixed(2))
}

/** Pico de potencia (kW) - base do calculo de excedente de demanda. */
export function peakPowerKw(values: (number | null)[]): number {
  const usable = values.filter((v): v is number => v !== null).map((v) => toNumber(v))
  return usable.length ? Number(Math.max(...usable).toFixed(2)) : 0
}

/** Desperdicio: razao entre energia IDLE e energia total. */
export function wasteRatio(idleEnergyKwh: number, totalEnergyKwh: number): number {
  const total = toNumber(totalEnergyKwh)
  if (total <= 0) return 0
  return Number((toNumber(idleEnergyKwh) / total).toFixed(4))
}