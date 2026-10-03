/**
 * EnergyMatrix EMS - portas do dominio (interfaces de repository + Clock).
 *
 * O dominio e a aplicacao dependem SOMENTE destas interfaces. As
 * implementacoes ficam em `database/repositories` (PostgreSQL) e
 * `database/repositories/memory` (fallback da demonstracao).
 */

import type { DataQuality, MachineState, RelationshipType, ScenarioId, UserRole } from "../value-objects/index.ts"
import type {
  Alert,
  AuditLog,
  CompetitionInterventionRecord,
  CompetitionSnapshot,
  CompetitionTelemetryPoint,
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
  ProtocolEvent,
  ReadingsCounters,
  RefreshToken,
  SectorMeta,
  Shift,
  Tariff,
  TelemetryReading,
  Tenant,
  Thresholds,
  User,
} from "../entities/index.ts"

/** Linha generica das series de relatorio (read models). */
export type JsonRow = Record<string, string | number>

export type { Logger, LogFields } from "./logger.ts"

/** Relogio injetavel - engines analiticos nunca leem o relogio do sistema. */
export interface Clock {
  now(): Date
  nowMs(): number
}

/** Paginacao (metadados vao para o header X-Total-Count). */
export interface Page {
  page: number
  limit: number
}

export interface Paged<T> {
  items: T[]
  total: number
}

export interface MachineQuery extends Partial<Page> {
  state?: string
  sector?: string
}

export interface TelemetryQuery {
  machineId: string
  from?: Date
  to?: Date
  limit?: number
}

export interface AlertQuery extends Partial<Page> {
  severity?: string
  status?: string
}

export interface ProtocolQuery extends Partial<Page> {
  status?: string
  priority?: string
  sla?: string
}

export interface IMachineRepository {
  list(query?: MachineQuery): Promise<MachineRecord[]>
  findById(id: string): Promise<MachineRecord | null>
  count(): Promise<number>
  save(machine: MachineRecord): Promise<MachineRecord>
  update(id: string, patch: Partial<MachineRecord>): Promise<MachineRecord | null>
  remove(id: string): Promise<boolean>
}

export interface ITelemetryRepository {
  append(reading: TelemetryReading): Promise<boolean>
  /** Leituras de uma maquina, ordenadas por ts ascendente. */
  listByMachine(query: TelemetryQuery): Promise<TelemetryReading[]>
  count(): Promise<number>
  /** Contabiliza a qualidade da leitura (GOOD/MISSING/OUTLIER/DUPLICATE). */
  recordQuality(quality: DataQuality): Promise<ReadingsCounters>
}

/** Intervalo de estado derivado (tabela machine_states). */
export interface MachineStateInterval {
  machineId: string
  state: MachineState
  fromTs: Date
  toTs: Date | null
}

/**
 * Estados derivados em intervalos (secao 2 do documento: `telemetry.state` e o
 * estado informado pela fonte; o estado DERIVADO vive em machine_states e e a
 * fonte do IdleEngine).
 */
export interface IMachineStateRepository {
  /** Fecha o intervalo aberto (se o estado mudou) e abre o novo. */
  openInterval(machineId: string, state: MachineState, at: Date): Promise<void>
  current(machineId: string): Promise<MachineStateInterval | null>
  list(machineId: string, from?: Date): Promise<MachineStateInterval[]>
  /** Minutos em IDLE no intervalo aberto (0 quando o estado atual nao e IDLE). */
  idleMinutes(machineId: string, now: Date): Promise<number>
}

export interface IAlertRepository {
  list(query?: AlertQuery): Promise<Alert[]>
  findById(id: string): Promise<Alert | null>
  countOpen(): Promise<number>
  save(alert: Alert): Promise<Alert>
  update(id: string, patch: Partial<Alert>): Promise<Alert | null>
}

export interface IInterventionRepository {
  list(): Promise<Intervention[]>
  save(intervention: Intervention): Promise<Intervention>
}

export interface IProtocolRepository {
  list(query?: ProtocolQuery): Promise<Protocol[]>
  findById(id: string): Promise<Protocol | null>
  nextSequence(year: number): Promise<number>
  save(protocol: Protocol): Promise<Protocol>
  update(id: string, patch: Partial<Protocol>): Promise<Protocol | null>
  appendEvent(id: string, event: ProtocolEvent): Promise<Protocol | null>
}

export interface IPlantRepository {
  list(): Promise<Plant[]>
  listSectorMeta(): Promise<SectorMeta[]>
}

export interface IConfigRepository {
  getTariff(): Promise<Tariff>
  setTariff(patch: Partial<Tariff>): Promise<Tariff>
  getThresholds(): Promise<Thresholds>
  setThresholds(patch: Partial<Thresholds>): Promise<Thresholds>
  listShifts(): Promise<Shift[]>
  toggleShift(id: string): Promise<Shift | null>
  listGatewayHealth(): Promise<GatewayHealth[]>
}

export interface IScenarioRepository {
  snapshot(): Promise<CompetitionSnapshot>
  setScenario(scenario: ScenarioId): Promise<CompetitionSnapshot>
  step(): Promise<CompetitionSnapshot>
  reset(): Promise<CompetitionSnapshot>
  /** Serie determinística da maquina do demo (null quando nao existe). */
  telemetry(machineId: string): Promise<CompetitionTelemetryPoint[] | null>
  addIntervention(input: {
    machineId?: string
    before: number
    after: number
  }): Promise<CompetitionInterventionRecord>
  advanceAlert(id: string): Promise<Alert | null>
}

/** Unidade de trabalho: garante atomicidade nas operacoes compostas. */
export interface UnitOfWork {
  transaction<T>(run: () => Promise<T>): Promise<T>
}

/**
 * Read models (relatorios/dashboard): series ja agregadas exibidas pelo
 * frontend. Mantidas como read models explicitos para nao poluir o dominio.
 */
export interface IReportRepository {
  readings(): Promise<ReadingsCounters>
  consumptionSeries(): Promise<ConsumptionPoint[]>
  shiftSeries(): Promise<JsonRow[]>
  costTrend(): Promise<JsonRow[]>
  machineBreakdown(): Promise<JsonRow[]>
  tariffProfile(): Promise<JsonRow[]>
  opportunities(): Promise<JsonRow[]>
  gateways(): Promise<Gateway[]>
  gatewayHealth(): Promise<GatewayHealth[]>
  nonMonitoredKwhDay(): Promise<number>
}

/* ------------------------------------------------------------------ */
/* Multi-tenancy / autenticacao (secao 7)                             */
/* ------------------------------------------------------------------ */

export interface ITenantRepository {
  list(): Promise<Tenant[]>
  findById(id: string): Promise<Tenant | null>
  findBySlug(slug: string): Promise<Tenant | null>
  save(tenant: Tenant): Promise<Tenant>
  update(id: string, patch: Partial<Tenant>): Promise<Tenant | null>
}

export interface IUserRepository {
  list(tenantId: string): Promise<User[]>
  findById(id: string, tenantId: string): Promise<User | null>
  /** Busca global (login): e-mail unico entre tenants (D15). */
  findByEmail(email: string): Promise<User | null>
  countByRole(tenantId: string, role: UserRole): Promise<number>
  save(user: User): Promise<User>
  update(id: string, tenantId: string, patch: Partial<User>): Promise<User | null>
}

export interface IInviteRepository {
  list(tenantId: string): Promise<Invite[]>
  findById(id: string, tenantId: string): Promise<Invite | null>
  /** Busca pelo hash do codigo (o codigo puro nunca e persistido). */
  findByCodeHash(codeHash: string): Promise<Invite | null>
  save(invite: Invite): Promise<Invite>
  update(id: string, tenantId: string, patch: Partial<Invite>): Promise<Invite | null>
}

export interface IRefreshTokenRepository {
  findByHash(tokenHash: string): Promise<RefreshToken | null>
  save(token: RefreshToken): Promise<RefreshToken>
  revoke(tokenHash: string, at: Date): Promise<boolean>
  revokeAllForUser(userId: string, at: Date): Promise<number>
}

export interface IAuditLogRepository {
  list(tenantId: string | null, limit?: number): Promise<AuditLog[]>
  append(entry: AuditLog): Promise<AuditLog>
}

/* ------------------------------------------------------------------ */
/* Eventos, relacoes e impacto (secao 11)                             */
/* ------------------------------------------------------------------ */

export interface MachineEventQuery {
  machineId?: string
  type?: string
  severity?: string
  limit?: number
}

export interface IMachineEventRepository {
  list(tenantId: string, query?: MachineEventQuery): Promise<MachineEvent[]>
  findById(id: string, tenantId: string): Promise<MachineEvent | null>
  save(event: MachineEvent): Promise<MachineEvent>
}

export interface IRelationshipRepository {
  list(tenantId: string): Promise<MachineRelationship[]>
  findById(id: string, tenantId: string): Promise<MachineRelationship | null>
  /** Verifica unicidade de (source, target, type) - D1. */
  findUnique(
    tenantId: string,
    sourceMachineId: string,
    targetMachineId: string,
    relationshipType: RelationshipType,
  ): Promise<MachineRelationship | null>
  save(rel: MachineRelationship): Promise<MachineRelationship>
  update(id: string, tenantId: string, patch: Partial<MachineRelationship>): Promise<MachineRelationship | null>
  remove(id: string, tenantId: string): Promise<boolean>
}

export interface ImpactAnalysisQuery {
  machineId?: string
  limit?: number
}

export interface IImpactAnalysisRepository {
  list(tenantId: string, query?: ImpactAnalysisQuery): Promise<ImpactAnalysis[]>
  findById(id: string, tenantId: string): Promise<ImpactAnalysis | null>
  save(analysis: ImpactAnalysis): Promise<ImpactAnalysis>
}