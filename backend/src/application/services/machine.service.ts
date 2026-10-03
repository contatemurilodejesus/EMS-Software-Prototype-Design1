/**
 * Application service - MAQUINAS e VISAO DA FABRICA (casos de uso).
 *
 * Orquestra repositories + engines analiticos. Nao conhece Express nem SQL:
 * recebe dados validados do controller e devolve DTOs do contrato atual.
 */

import { NOMINAL_VOLTAGE } from "../../analytics/anomaly.ts"
import { computeIdleCostDay } from "../../analytics/idle.ts"
import { dataQuality } from "../../analytics/quality.ts"
import { aggregateSectors } from "../../analytics/sectors.ts"
import { describeAnomalies, resolveState } from "../../analytics/state.ts"
import { dnoise, hashId } from "../../shared/utils/deterministic.ts"
import { clone, formatDateTime, formatTime, toNumber } from "../../shared/utils/index.ts"
import { currentTenantId } from "../../shared/tenant-context.ts"
import {
  ConflictError,
  ERROR_CODES,
  NotFoundError,
  ValidationError,
} from "../../domain/errors/index.ts"
import type { LoadPoint, Machine, MachineRecord } from "../../domain/entities/index.ts"
import type { MachineQuery } from "../../domain/ports/index.ts"
import type { ServiceContext } from "../context.ts"

export interface MachineInput {
  id?: unknown
  name?: unknown
  type?: unknown
  sector?: unknown
  gateway?: unknown
  nominalKW?: unknown
  pOff?: unknown
  pRun?: unknown
  power?: unknown
  consumption?: unknown
  temperature?: unknown
  powerFactor?: unknown
  voltage?: unknown
  current?: unknown
  coverage?: unknown
}

export function createMachineService(ctx: ServiceContext) {
  const log = ctx.logger.child({ service: "MachineService" })

  /** Aplica o dominio a uma lista de maquinas (estado, anomalias, IDLE). */
  async function decorate(records: MachineRecord[]): Promise<Machine[]> {
    const thresholds = await ctx.config.getThresholds()
    const tariff = await ctx.config.getTariff()
    const now = ctx.clock.now()
    const out: Machine[] = []

    for (const record of records) {
      const { state, anomalies } = resolveState(
        {
          power: record.power,
          pOff: record.pOff,
          pRun: record.pRun,
          temperature: record.temperature,
          powerFactor: record.powerFactor,
          voltage: record.voltage,
          current: record.current,
          nominalKW: record.nominalKW,
          online: record.online !== false,
        },
        thresholds,
      )

      const idle = state === "IDLE"
      const idleFromStates = idle ? await ctx.machineStates.idleMinutes(record.id, now) : 0

      out.push({
        ...clone(record),
        state,
        anomalies,
        anomalyDesc: describeAnomalies(anomalies),
        idleMinutes: idle
          ? Math.round(toNumber(idleFromStates) || toNumber(record.idleMinutes))
          : undefined,
        idleCostDay: idle
          ? Math.round(toNumber(record.idleCostDay) || computeIdleCostDay(record.power, tariff))
          : undefined,
      })
    }

    return out
  }

  async function list(query: MachineQuery = {}): Promise<Machine[]> {
    const records = await ctx.machines.list({ sector: query.sector })
    let machines = await decorate(records)

    if (query.state && query.state !== "all") {
      const wanted = String(query.state).toUpperCase()
      machines = machines.filter((m) => m.state === wanted)
    }

    return machines
  }

  async function findById(id: string): Promise<Machine | null> {
    const record = await ctx.machines.findById(id)
    if (!record) return null
    const [machine] = await decorate([record])
    return machine ?? null
  }

  /**
   * Curva de carga de 24 h determinística (substitui Math.random()).
   * Coerente com o estado atual da maquina.
   */
  function loadCurve(machine: Machine): LoadPoint[] {
    const seed = hashId(machine.id)
    return Array.from({ length: 24 }, (_, hour) => {
      let base = machine.pOff
      const inShift = hour >= 6 && hour < 22

      if (machine.state === "RUNNING") {
        base = inShift ? machine.pRun + dnoise(hour, seed) * 2 : machine.pOff
      } else if (machine.state === "IDLE") {
        base = inShift
          ? machine.pOff + (machine.pRun - machine.pOff) * 0.4 + dnoise(hour, seed) * 0.5
          : machine.pOff
      } else if (machine.state === "ANOMALY") {
        base = machine.pRun * 1.6 + dnoise(hour, seed + 3) * 4
      }

      return { h: `${hour}h`, p: Math.max(0, Number(base.toFixed(1))) }
    })
  }

  async function create(input: MachineInput): Promise<Machine> {
    const id = String(input.id ?? "").trim()
    if (!id) throw new ValidationError('Campo "id" é obrigatório')

    const existing = await ctx.machines.findById(id)
    if (existing) throw new ConflictError(`Máquina ${id} já existe`, ERROR_CODES.MACHINE_ALREADY_EXISTS)

    const record: MachineRecord = {
      id,
      // `tenantId` vem SEMPRE do contexto autenticado (secao 7.1.1) - nunca
      // do corpo da requisicao.
      tenantId: currentTenantId(),
      name: String(input.name ?? id),
      type: String(input.type ?? "Geral"),
      sector: String(input.sector ?? "Setor A"),
      gateway: String(input.gateway ?? "GW-SP01"),
      nominalKW: toNumber(input.nominalKW) || 10,
      pOff: toNumber(input.pOff) || 1,
      pRun: toNumber(input.pRun) || 5,
      voltage: toNumber(input.voltage) || NOMINAL_VOLTAGE,
      current: toNumber(input.current),
      power: toNumber(input.power),
      consumption: toNumber(input.consumption),
      temperature: toNumber(input.temperature) || 25,
      powerFactor: toNumber(input.powerFactor) || 0.92,
      coverage: toNumber(input.coverage) || 100,
      lastUpdate: formatTime(ctx.clock.now()),
      quality: "GOOD",
      online: true,
    }

    await ctx.machines.save(record)
    log.info("Maquina cadastrada", { machineId: id })

    const [machine] = await decorate([record])
    return machine
  }

  async function update(id: string, patch: MachineInput = {}): Promise<Machine> {
    const record = await ctx.machines.findById(id)
    if (!record) throw new NotFoundError(`Máquina ${id} não encontrada`, ERROR_CODES.MACHINE_NOT_FOUND)

    const clean: Partial<MachineRecord> = {}
    if (patch.name !== undefined) clean.name = String(patch.name)
    if (patch.type !== undefined) clean.type = String(patch.type)
    if (patch.sector !== undefined) clean.sector = String(patch.sector)
    if (patch.gateway !== undefined) clean.gateway = String(patch.gateway)
    if (patch.nominalKW !== undefined) clean.nominalKW = toNumber(patch.nominalKW)
    if (patch.pOff !== undefined) clean.pOff = toNumber(patch.pOff)
    if (patch.pRun !== undefined) clean.pRun = toNumber(patch.pRun)
    if (patch.coverage !== undefined) clean.coverage = toNumber(patch.coverage)

    const updated = await ctx.machines.update(id, clean)
    log.info("Maquina atualizada", { machineId: id, fields: Object.keys(clean) })

    const [machine] = await decorate([updated ?? record])
    return machine
  }

  async function remove(id: string): Promise<void> {
    const removed = await ctx.machines.remove(id)
    if (!removed) throw new NotFoundError(`Máquina ${id} não encontrada`, ERROR_CODES.MACHINE_NOT_FOUND)
    log.info("Maquina removida", { machineId: id })
  }

  /** Agregacao por setor (kWh, custo, cobertura, contagens por estado). */
  async function sectors() {
    const machines = await list({})
    const tariff = await ctx.config.getTariff()
    const sectorMeta = await ctx.plants.listSectorMeta()
    return aggregateSectors(machines, tariff, sectorMeta)
  }

  /** Visao da Fabrica: KPIs, setores, curva 24 h, qualidade e gateways. */
  async function summary() {
    const machines = await list({})
    const sectorList = await sectors()
    const plants = await ctx.plants.list()
    const plant = plants[0]

    if (!plant) throw new NotFoundError("Planta não cadastrada")

    const alerts = await ctx.alerts.list({})
    const readings = await ctx.reports.readings()

    const totals = {
      kwh: Math.round(sectorList.reduce((sum, s) => sum + s.kwh, 0)),
      cost: Math.round(sectorList.reduce((sum, s) => sum + s.cost, 0)),
      idleCost: Math.round(sectorList.reduce((sum, s) => sum + s.idleCost, 0)),
      idleMachines: machines.filter((m) => m.state === "IDLE").length,
      running: machines.filter((m) => m.state === "RUNNING").length,
      anomaly: machines.filter((m) => m.state === "ANOMALY").length,
      off: machines.filter((m) => m.state === "STOPPED" || m.state === "OFFLINE").length,
      alerts: alerts.length,
    }

    return {
      plant,
      demandLimitKW: plant.demandLimitKW,
      totals,
      sectors: sectorList,
      consumption: await ctx.reports.consumptionSeries(),
      dataQuality: dataQuality(readings),
      gateways: await ctx.reports.gateways(),
      nonMonitoredKwhDay: await ctx.reports.nonMonitoredKwhDay(),
      livePower: machines.reduce((sum, m) => sum + toNumber(m.power), 0).toFixed(1),
      timestamp: formatDateTime(ctx.clock.now()),
    }
  }

  /** Plantas cadastradas (contrato GET /api/plants). */
  async function listPlants() {
    return ctx.plants.list()
  }

  return {
    decorate,
    list,
    findById,
    loadCurve,
    create,
    update,
    remove,
    sectors,
    summary,
    listPlants,
  }
}

export type MachineService = ReturnType<typeof createMachineService>