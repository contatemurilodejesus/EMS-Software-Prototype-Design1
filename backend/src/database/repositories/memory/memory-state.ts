/**
 * EnergyMatrix EMS - ESTADO EM MEMORIA (adaptador de demonstracao).
 *
 * Justificativa (secao 22 do documento): a demonstracao precisa rodar sem
 * Docker/PostgreSQL disponivel. Este adaptador implementa os MESMOS ports dos
 * repositories PostgreSQL, sem alterar dominio, analytics ou aplicacao - o
 * modo e escolhido por `EMS_PERSISTENCE=memory|postgres`.
 *
 * Dados deterministicos: nenhum `Math.random()` (a telemetria ao vivo usa
 * ruido deterministico derivado do passo).
 */

import type {
  Alert,
  ConsumptionPoint,
  Gateway,
  GatewayHealth,
  Intervention,
  MachineRecord,
  Plant,
  Protocol,
  ReadingsCounters,
  SectorMeta,
  Shift,
  Tariff,
  TelemetryReading,
  Thresholds,
} from "../../../domain/entities/index.ts"
import type { MachineStateInterval } from "../../../domain/ports/index.ts"
import { DEFAULT_TARIFF } from "../../../analytics/cost.ts"
import { DEFAULT_THRESHOLDS } from "../../../analytics/anomaly.ts"
import { clone } from "../../../shared/utils/index.ts"
import {
  createCompetitionSimulator,
  type CompetitionSimulator,
} from "../../../simulator/competition.ts"
import * as seed from "../../seeds/seed-data.ts"

/** Linhas das series de relatorio (tabelas/graficos exibidos pelo front). */
export type JsonRow = Record<string, string | number>

export interface MemoryState {
  version: string
  startedAtMs: number
  live: boolean
  plants: Plant[]
  sectorMeta: SectorMeta[]
  machines: MachineRecord[]
  telemetry: TelemetryReading[]
  machineStates: MachineStateInterval[]
  alerts: Alert[]
  interventions: Intervention[]
  protocols: Protocol[]
  shifts: Shift[]
  gateways: Gateway[]
  gatewayHealth: GatewayHealth[]
  readings: ReadingsCounters
  consumptionSeries: ConsumptionPoint[]
  shiftData: JsonRow[]
  costTrend: JsonRow[]
  machineBreakdown: JsonRow[]
  tariffProfile: JsonRow[]
  opportunities: JsonRow[]
  nonMonitoredKwhDay: number
  tariff: Tariff
  thresholds: Thresholds
  tickCount: number
  lastTickAtMs: number
  alertSeq: number
  protocolSeq: number
  simulator: CompetitionSimulator
}

export interface CreateMemoryStateOptions {
  live?: boolean
  tariff?: Tariff
  version?: string
  startedAtMs?: number
}

export function createMemoryState(options: CreateMemoryStateOptions = {}) {
  const state: MemoryState = {
    version: options.version ?? "2.0.0",
    startedAtMs: options.startedAtMs ?? 0,
    live: options.live !== false,
    plants: [],
    sectorMeta: [],
    machines: [],
    telemetry: [],
    machineStates: [],
    alerts: [],
    interventions: [],
    protocols: [],
    shifts: [],
    gateways: [],
    gatewayHealth: [],
    readings: { good: 0, missing: 0, outlier: 0, duplicate: 0 },
    consumptionSeries: [],
    shiftData: [],
    costTrend: [],
    machineBreakdown: [],
    tariffProfile: [],
    opportunities: [],
    nonMonitoredKwhDay: seed.NON_MONITORED_KWH_DAY,
    tariff: clone(options.tariff ?? DEFAULT_TARIFF),
    thresholds: clone(DEFAULT_THRESHOLDS),
    tickCount: 0,
    lastTickAtMs: options.startedAtMs ?? 0,
    alertSeq: 42,
    protocolSeq: 0,
    simulator: createCompetitionSimulator({ tariff: options.tariff ?? DEFAULT_TARIFF }),
  }

  /** Restaura o estado dos seeds (equivale ao `reset` do demo). */
  function reset(): void {
    state.plants = clone(seed.PLANTS)
    state.sectorMeta = clone(seed.SECTOR_META)
    state.machines = clone(seed.MACHINES)
    state.alerts = clone(seed.ALERTS)
    state.interventions = clone(seed.INTERVENTIONS)
    state.protocols = clone(seed.PROTOCOLS)
    state.shifts = clone(seed.SHIFTS)
    state.gateways = clone(seed.GATEWAYS)
    state.gatewayHealth = clone(seed.GATEWAY_HEALTH)
    state.readings = clone(seed.READINGS)
    state.consumptionSeries = clone(seed.CONSUMPTION_SERIES)
    state.shiftData = clone(seed.SHIFT_DATA)
    state.costTrend = clone(seed.COST_TREND)
    state.machineBreakdown = clone(seed.MACHINE_BREAKDOWN)
    state.tariffProfile = clone(seed.TARIFF_PROFILE)
    state.opportunities = clone(seed.OPPORTUNITIES)
    state.nonMonitoredKwhDay = seed.NON_MONITORED_KWH_DAY
    state.tariff = clone(options.tariff ?? DEFAULT_TARIFF)
    state.thresholds = clone(DEFAULT_THRESHOLDS)
    state.telemetry = []
    state.machineStates = []
    state.tickCount = 0
    state.lastTickAtMs = 0
    state.alertSeq = 42
    state.protocolSeq = 0
    state.simulator.reset("NORMAL")
  }

  reset()

  return { state, reset }
}

export type MemoryStore = ReturnType<typeof createMemoryState>