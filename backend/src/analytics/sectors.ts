/**
 * Engine ANALITICO - Agregacao por setor (Visao da Fabrica).
 *
 * Portado do dominio legado sem alteracao de resultado: contagens por estado,
 * kWh, custo ponderado pela tarifa media e cobertura media dos sensores.
 */

import type { Machine, SectorAggregate, SectorMeta, Tariff } from "../domain/entities/index.ts"
import { blendedRate } from "./cost.ts"
import { toNumber } from "../shared/utils/index.ts"

export function aggregateSectors(
  machines: Machine[],
  tariff: Tariff,
  sectorMeta: SectorMeta[] = [],
): SectorAggregate[] {
  const byName = new Map<
    string,
    {
      name: string
      machines: number
      running: number
      idle: number
      off: number
      anomaly: number
      kwh: number
      idleCost: number
      coverageSum: number
      weighted: number
    }
  >()

  for (const machine of machines) {
    if (!byName.has(machine.sector)) {
      byName.set(machine.sector, {
        name: machine.sector,
        machines: 0,
        running: 0,
        idle: 0,
        off: 0,
        anomaly: 0,
        kwh: 0,
        idleCost: 0,
        coverageSum: 0,
        weighted: 0,
      })
    }

    const sector = byName.get(machine.sector)!
    sector.machines += 1
    sector.kwh += toNumber(machine.consumption)
    sector.coverageSum += toNumber(machine.coverage)
    sector.weighted += toNumber(machine.consumption) * blendedRate(tariff)

    const state = String(machine.state || "").toUpperCase()
    if (state === "ANOMALY") {
      sector.anomaly += 1
      sector.running += 1
    } else if (state === "RUNNING") sector.running += 1
    else if (state === "IDLE") sector.idle += 1
    else sector.off += 1

    if (state === "IDLE") sector.idleCost += toNumber(machine.idleCostDay)
  }

  return [...byName.values()].map((sector) => {
    const meta = sectorMeta.find((x) => x.name === sector.name)
    return {
      id: meta?.id ?? (sector.name.replace(/^Setor\s*/i, "").trim() || sector.name),
      name: sector.name,
      machines: sector.machines,
      running: sector.running,
      idle: sector.idle,
      off: sector.off,
      anomaly: sector.anomaly,
      kwh: Math.round(sector.kwh),
      cost: Math.round(sector.weighted),
      idleCost: Math.round(sector.idleCost),
      coverage: sector.machines ? Math.round(sector.coverageSum / sector.machines) : 100,
    }
  })
}