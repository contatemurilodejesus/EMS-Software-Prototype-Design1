/**
 * EnergyMatrix EMS - entidades do dominio.
 *
 * Os nomes de campo preservam EXATAMENTE os contratos atuais da API
 * (o frontend nao e reconstruido). Tipos utilitarios aqui sao estruturais.
 */

import type {
  AlertSeverity,
  AlertStatus,
  DataQuality,
  EventSeverity,
  ImpactClassification,
  MachineEventType,
  MachineState,
  ProtocolEventType,
  ProtocolOrigin,
  ProtocolPriority,
  ProtocolStatus,
  RelationshipType,
  ScenarioId,
  SlaState,
  TelemetrySource,
  TenantStatus,
  UserRole,
  UserStatus,
} from "../value-objects/index.ts"

export interface Plant {
  id: string
  name: string
  timezone?: string
  demandLimitKW: number
  areaM2?: number
  gatewayCount?: number
}

export interface SectorMeta {
  id: string
  name: string
  areaM2?: number
}

export interface SectorAggregate {
  id: string
  name: string
  machines: number
  running: number
  idle: number
  off: number
  anomaly: number
  kwh: number
  cost: number
  idleCost: number
  coverage: number
}

/** Gateway exibido na Visao da Fabrica (contrato atual do prototipo). */
export interface Gateway {
  id: string
  label: string
  status: string
  sub: string
}

/** Indicador da saude do gateway (chave/valor, exibido em cards). */
export interface GatewayHealth {
  k: string
  ok: boolean
  v: string | number
}

/** Linha persistida de `machines` (sem estado derivado). */
export interface MachineRecord {
  id: string
  /** Multi-tenancy: obrigatorio em todo dado da empresa (secao 7.1). */
  tenantId?: string
  name: string
  type: string
  sector: string
  gateway: string
  nominalKW: number
  pOff: number
  pRun: number
  voltage: number
  current: number
  power: number
  consumption: number
  temperature: number
  powerFactor: number
  coverage: number
  baselineKw?: number
  idleMinutes?: number
  idleCostDay?: number
  lastUpdate: string
  quality?: DataQuality
  online?: boolean
  /** Ultima telemetria nao-MISSING (alimenta o OfflineWatchdog, D9). */
  lastMessageAt?: string | null
}

export interface Anomaly {
  type: string
  severity: AlertSeverity
  desc: string
  condition: string
}

/** Maquina com estado/anomalias derivados pelos engines analiticos. */
export interface Machine extends MachineRecord {
  state: MachineState
  anomalies: Anomaly[]
  anomalyDesc?: string
  idleCostDay?: number
}

export interface LoadPoint {
  h: string
  p: number
}

/** Contrato de telemetria (secao 9) - fronteira entre fonte e ingestao. */
export interface TelemetryReading {
  machineId: string
  ts: Date
  powerKw: number
  energyKwh: number | null
  voltageV: number | null
  currentA: number | null
  powerFactor: number | null
  temperatureC: number | null
  state: MachineState
  quality: DataQuality
  /** D7: REAL ou SIMULATED - obrigatorio; simulador sempre SIMULATED. */
  source: TelemetrySource
  /** Opcional (D14): sensor que produziu a leitura. */
  sensorId?: string | null
}

export interface Alert {
  id: string
  tenantId?: string
  key?: string
  machine: string
  machineId: string
  sector: string
  anomaly: string
  anomalyType: string
  condition: string
  peakTime?: string
  severity: AlertSeverity
  status: AlertStatus
  action?: string
  message?: string
  /**
   * Evidencia do alerta. O contrato legado do prototipo usa texto; as
   * analises de impacto (D21) anexam evidencia estruturada (jsonb).
   */
  evidence?: string | Record<string, string | number>
  detectedAt: string
  auto?: boolean
  idleCost?: string
  acknowledgedAt?: string
  resolvedAt?: string
  assignee?: string
  /** Rotulo de classificacao economica (OBSERVED/ESTIMATED/SIMULATED). */
  classification?: ImpactClassification
  /** Valor economico estimado associado ao alerta, quando houver. */
  estimated?: boolean
  avoidableKwh?: number
  estimatedCost?: number
}

export interface Intervention {
  id: string
  date: string
  machine: string
  machineId?: string
  desc: string
  before: number
  after: number
  saved: number
  period: string
  confidence: string
  status: string
  simulated?: boolean
  savedKwhDay?: number
  savedBrlDay?: number
  estimated?: boolean
}

export interface ProtocolEvent {
  at: string
  type: ProtocolEventType
  actor: string
  note: string
}

export interface Protocol {
  id: string
  title: string
  machineId: string
  machine: string
  sector: string
  origin: ProtocolOrigin | string
  priority: ProtocolPriority
  status: ProtocolStatus
  alertId: string | null
  assignee: string
  description: string
  openedAt: string
  deadline?: string
  closedAt?: string | null
  slaHours?: number
  sla?: SlaState
  slaLabel?: string
  hoursToDeadline?: number
  evidence: string[]
  events: ProtocolEvent[]
}

export interface TariffSchedule {
  offPeak: number[][]
  intermediate: number[][]
  peak: number[][]
}

export interface Tariff {
  offPeak: number
  intermediate: number
  peak: number
  contractedDemandKW: number
  excessDemandPenalty: number
  schedule?: TariffSchedule
}

/* ------------------------------------------------------------------ */
/* Multi-tenancy e autenticacao (secao 7 do documento)                */
/* ------------------------------------------------------------------ */

export interface Tenant {
  id: string
  name: string
  slug: string
  status: TenantStatus
  createdAt: string
  updatedAt: string
}

export interface User {
  id: string
  tenantId: string
  name: string
  email: string
  passwordHash: string
  role: UserRole
  status: UserStatus
  lastLoginAt?: string | null
  createdAt: string
  updatedAt: string
}

/** Convite de uso unico: so o hash do codigo e guardado (7.2). */
export interface Invite {
  id: string
  tenantId: string
  role: UserRole
  codeHash: string
  expiresAt: string
  usedAt?: string | null
  createdBy: string
  usedBy?: string | null
}

/** Refresh token: hash no banco, revogado no logout (D5). */
export interface RefreshToken {
  id: string
  tenantId: string
  userId: string
  tokenHash: string
  expiresAt: string
  revokedAt?: string | null
  ip?: string
  userAgent?: string
}

/** Trilha de auditoria (7.5). Nunca guarda senhas ou tokens. */
export interface AuditLog {
  id: string
  tenantId: string | null
  userId: string | null
  action: string
  resource: string
  resourceId?: string | null
  metadata?: Record<string, unknown>
  ip?: string
  userAgent?: string
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* Eventos, relacoes e impacto (secao 11 do documento)                */
/* ------------------------------------------------------------------ */

export interface MachineEvent {
  id: string
  tenantId: string
  machineId: string
  type: MachineEventType
  severity: EventSeverity
  timestamp: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface MachineRelationship {
  id: string
  tenantId: string
  sourceMachineId: string
  targetMachineId: string
  relationshipType: RelationshipType
  dependencyLevel: number
  active: boolean
  createdAt: string
  updatedAt: string
}

/** Registro rastreavel da cascata (D21): janela, kWh, custo, evidencia. */
export interface ImpactAnalysis {
  id: string
  tenantId: string
  triggerEventId?: string | null
  machineId: string
  windowStart: string
  windowEnd: string
  avoidableKwh: number
  estimatedCost: number
  classification: ImpactClassification
  evidence: Record<string, unknown>
  alertId?: string | null
  createdAt: string
}

export interface Thresholds {
  temperatureCriticalC: number
  temperatureWarnC: number
  powerFactorMin: number
  voltageTolerancePct: number
  overcurrentFactor: number
  idleMinutesWarn: number
  demandNominalKW: number
  baselineTolerancePct?: number
}

/** Turno de operacao (modulo Admin e Relatorios). */
export interface Shift {
  id: string
  label: string
  time: string
  active: boolean
}

export interface ConsumptionPoint {
  time: string
  consumo: number
}

export interface ReadingsCounters {
  good: number
  missing: number
  outlier: number
  duplicate: number
}

/** Visao do Competition Mode (payload de /api/competition). */
export interface CompetitionMachine {
  id: string
  name: string
  type: string
  sector: string
  gateway: string
  pOff: number
  pIdle: number
  pRun: number
  baselineKw: number
  nominalKW: number
  state: MachineState
  quality: DataQuality
  online: boolean
  power: number
  voltage: number
  current: number
  powerFactor: number
  temperature: number
  consumption: number
  idleMinutes?: number
  idleCostDay?: number
  deviationPct: number
  anomalyDesc?: string
  lastUpdate: string
}

/**
 * KPIs do Competition Mode (mesmas chaves do contrato atual).
 */
export interface CompetitionKpis {
  energyKwh?: number
  costBrl?: number
  wasteKwh?: number
  wasteBrl?: number
  alerts?: number
  machines?: number
  idleMachines?: number
  anomalyMachines?: number
  offlineMachines?: number
  criticalMachine?: string | null
  criticalMachineName?: string | null
  savingsBrl?: number
  estimated?: boolean
}

/** Analytics deterministico do demo (rotulado como estimativa). */
export interface CompetitionAnalytics {
  simulated: boolean
  scenario: ScenarioId
  step: number
  idle: {
    machines: unknown[]
    totalIdleEnergyKwh: number
    totalIdleCost: number
    estimated: boolean
  }
  anomalies: unknown[]
  cost: {
    ratePerKwh: number
    perMachine: unknown[]
    estimated: boolean
    note: string
  }
}

/** Ponto da serie de telemetria do Competition Mode (rotulo T+N min). */
export interface CompetitionTelemetryPoint {
  ts: string
  powerKw: number
  temperatureC: number
  voltageV: number
  state: MachineState
  quality: DataQuality
}

/** Intervencao registrada dentro do Competition Mode. */
export interface CompetitionInterventionRecord {
  id: string
  machineId: string
  description: string
  before: number
  after: number
  saved: number
  simulated: boolean
  createdAt: string
}

/**
 * Snapshot do Competition Mode: `status()` + maquinas + analytics.
 */
export interface CompetitionSnapshot {
  scenario: ScenarioId
  step: number
  simulated: boolean
  deterministic: boolean
  kpis: CompetitionKpis
  machines: CompetitionMachine[]
  alerts: Alert[]
  interventions: CompetitionInterventionRecord[]
  analytics: CompetitionAnalytics
  scenarioLabel?: string
  targetMachine?: string | null
  note?: string
  scenarios?: unknown[]
  beforeAfter?: unknown
}

export interface MachineSignal {
  power: number
  pOff: number
  pRun: number
  temperature: number
  powerFactor: number
  voltage: number
  current: number
  nominalKW: number
  online?: boolean
}