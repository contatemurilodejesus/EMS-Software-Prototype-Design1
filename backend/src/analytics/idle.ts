/**
 * Engine ANALITICO - IDLE (consumo improdutivo) e Energia de intervalo.
 *
 * Regra: somar a energia dos intervalos em IDLE -> kWh e R$ improdutivos.
 * Valores sempre rotulados como ESTIMATIVA do cenario simulado.
 */

import type { Tariff } from "../domain/entities/index.ts"
import type { MachineState } from "../domain/value-objects/index.ts"
import { toNumber } from "../shared/utils/index.ts"
import { blendedRate, DEFAULT_TARIFF, costOfEnergy } from "./cost.ts"

/** Minutos em IDLE antes de gerar alerta de consumo improdutivo. */
export const IDLE_ALERT_MINUTES = 5

/**
 * Custo estimado (R$/dia) de operacao em IDLE.
 * Formula: P_idle (kW) x horas de operacao/dia x tarifa media ponderada.
 */
export function computeIdleCostDay(
  power: number,
  tariff: Tariff = DEFAULT_TARIFF,
  operationalHours = 16,
): number {
  return Math.round(toNumber(power) * operationalHours * blendedRate(tariff))
}

/** Estado IDLE corresponde a maquina em servico sem producao registrada. */
export function isIdle(state: MachineState | undefined): boolean {
  return state === "IDLE"
}

/** Minutos em IDLE no intervalo (1 passo = 1 minuto simulado por padrao). */
export function idleMinutesAfter(
  previousIdleMinutes: number,
  state: MachineState,
  minutesPerInterval = 1,
): number {
  return isIdle(state) ? previousIdleMinutes + minutesPerInterval : 0
}

export interface IdleWaste {
  idleMinutes: number
  idleEnergyKwh: number
  idleCostBrl: number
  estimated: true
}

/** Energia/custo improdutivo acumulado de uma maquina. */
export function idleWaste(
  idleMinutes: number,
  idleEnergyKwh: number,
  tariff: Tariff = DEFAULT_TARIFF,
): IdleWaste {
  const kwh = Number(toNumber(idleEnergyKwh).toFixed(3))
  return {
    idleMinutes: toNumber(idleMinutes),
    idleEnergyKwh: kwh,
    idleCostBrl: costOfEnergy(kwh, tariff),
    estimated: true,
  }
}

/** Totais improdutivos de um conjunto de maquinas. */
export function idleTotals(
  entries: { idleMinutes: number; idleEnergyKwh: number }[],
  tariff: Tariff = DEFAULT_TARIFF,
): { totalIdleEnergyKwh: number; totalIdleCost: number; machinesIdle: number; estimated: true } {
  const idleEnergy = entries.reduce((sum, e) => sum + toNumber(e.idleEnergyKwh), 0)
  return {
    totalIdleEnergyKwh: Number(idleEnergy.toFixed(2)),
    totalIdleCost: costOfEnergy(idleEnergy, tariff),
    machinesIdle: entries.filter((e) => toNumber(e.idleMinutes) > 0).length,
    estimated: true,
  }
}