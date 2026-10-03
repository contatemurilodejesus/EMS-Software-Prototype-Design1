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
  AuditLog,
  ConsumptionPoint,
  Gateway,
  GatewayHealth,
  ImpactAnalysis,
  Intervention,
  Invite,
  MachineEvent,
  MachineRecord,
  MachineRelationship,
  Plant,
  Protocol,
  ReadingsCounters,
  RefreshToken,
  SectorMeta,
  Shift,
  Tariff,
  TelemetryReading,
  Tenant,
  Thresholds,
  User,
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
  /** Multi-tenancy (secao 7): dados de autenticacao e da empresa. */
  tenants: Tenant[]
  users: User[]
  invites: Invite[]
  refreshTokens: RefreshToken[]
  auditLogs: AuditLog[]
  machineEvents: MachineEvent[]
  relationships: MachineRelationship[]
  impactAnalyses: ImpactAnalysis[]
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
  eventSeq: number
  auditSeq: number
  simulator: CompetitionSimulator
}

export interface CreateMemoryStateOptions {
  live?: boolean
  tariff?: Tariff
  version?: string
  startedAtMs?: number
  /**
   * Usuarios do seed (hash de senhas a partir das credenciais do ambiente).
   * O container monta a lista com `createSeedUsers(env)`.
   */
  seedUsers?: User[]
}

export function createMemoryState(options: CreateMemoryStateOptions = {}) {
  const state: MemoryState = {
    version: options.version ?? "2.0.0",
    startedAtMs: options.startedAtMs ?? 0,
    live: options.live !== false,
    tenants: [],
    users: [],
    invites: [],
    refreshTokens: [],
    auditLogs: [],
    machineEvents: [],
    relationships: [],
    impactAnalyses: [],
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
    eventSeq: 0,
    auditSeq: 0,
    simulator: createCompetitionSimulator({ tariff: options.tariff ?? DEFAULT_TARIFF }),
  }

  /** Restaura o estado dos seeds (equivale ao `reset` do demo). */
  function reset(): void {
    state.tenants = clone(seed.TENANTS)
    state.users = options.seedUsers ? clone(options.seedUsers) : []
    state.invites = []
    state.refreshTokens = []
    state.auditLogs = []
    state.machineEvents = []
    state.relationships = clone(seed.RELATIONSHIPS)
    state.impactAnalyses = []
    state.plants = clone(seed.PLANTS)
    state.sectorMeta = clone(seed.SECTOR_META)
    // Todo dado de demonstracao pertence ao Tenant A; o Tenant B tem a sua
    // propria maquina minima (teste de isolamento, secao 18.1).
    state.machines = [
      ...clone(seed.MACHINES).map((m) => ({ ...m, tenantId: seed.TENANT_A_ID })),
      // As 3 maquinas do Competition Mode (secao 10.2) - M-001 -> M-002 -> M-003.
      ...clone(seed.DEMO_MACHINES),
      ...clone(seed.TENANT_B_MACHINES),
    ]
    state.alerts = clone(seed.ALERTS).map((a) => ({ ...a, tenantId: seed.TENANT_A_ID }))
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
    state.eventSeq = 0
    state.auditSeq = 0
    state.simulator.reset("NORMAL")
  }

  reset()

  return { state, reset }
}

export type MemoryStore = ReturnType<typeof createMemoryState>