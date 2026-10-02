/**
 * Tipos das respostas da API EnergyMatrix EMS (server/api.mjs).
 * Mantidos alinhados com os payloads do backend.
 */

export type MachineState = "OFF" | "IDLE" | "RUNNING" | "ANOMALY"

export type Severity = "critical" | "high" | "medium"

export type AlertStatus = "open" | "acknowledged" | "resolved"

export interface Anomaly {
  type: string

  severity: Severity

  desc: string

  condition: string
}

export interface Machine {
  id: string

  name: string

  type: string

  sector: string

  gateway: string

  nominalKW: number

  pOff: number

  pRun: number

  state: MachineState

  voltage: number

  current: number

  power: number

  consumption: number

  temperature: number

  powerFactor: number

  coverage: number

  lastUpdate: string

  idleMinutes?: number

  idleCostDay?: number

  anomalyDesc?: string

  anomalies?: Anomaly[]

  loadCurve?: { h: string; p: number }[]
}

export interface Sector {
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

export interface Alert {
  id: string

  machine: string

  machineId: string

  sector: string

  anomaly: string

  anomalyType: string

  condition: string

  peakTime: string

  severity: Severity

  status: AlertStatus

  action: string

  detectedAt: string

  acknowledgedAt?: string

  resolvedAt?: string

  assignee?: string

  idleCost?: string

  auto?: boolean
}

export interface AlertsSummary {
  total: number

  openCritical: number

  openIdle: number

  bySeverity: Record<Severity, number>
}

export interface Gateway {
  id: string

  label: string

  status: string

  sub: string
}

export interface Summary {
  plant: { id: string; name: string; demandLimitKW: number; timezone: string }

  demandLimitKW: number

  totals: {
    kwh: number

    cost: number

    idleCost: number

    idleMachines: number

    running: number

    anomaly: number

    off: number

    alerts: number
  }

  sectors: Sector[]

  consumption: { time: string; consumo: number }[]

  dataQuality: { label: string; value: number; color: string }[]

  gateways: Gateway[]

  nonMonitoredKwhDay: number

  livePower: string

  timestamp: string
}

export interface Tariff {
  offPeak: number

  intermediate: number

  peak: number

  contractedDemandKW: number

  excessDemandPenalty: number
}

export interface Intervention {
  id: string

  date: string

  machine: string

  desc: string

  before: number

  after: number

  saved: number

  period: string

  confidence: string

  status: string
}

export interface Economy {
  cusum: { dia: number; economy: number; baseline: number; medido: number }[]

  opportunities: {
    machine: string
    machineId: string
    sector: string
    type: string

    costDay: number
    costMonth: number
    costYear: number
    action: string
    confidence: string
  }[]

  interventions: Intervention[]

  totals: {
    savingsAccumulated: number
    opportunityMonth: number
    activeSavings: number
    tariff: Tariff
  }
}

export interface Reports {
  shiftData: { month: string; turnoA: number; turnoB: number; turnoC: number }[]

  costTrend: { month: string; custo: number; meta: number }[]

  machineBreakdown: { name: string; value: number; fill: string }[]

  tariffProfile: { h: string; r: number }[]

  tariff: Tariff
}

export interface AdminData {
  machines: {
    id: string
    name: string
    sector: string
    gateway: string
    pOff: number
    pRun: number
    nominal: number
  }[]

  tariffs: Tariff

  shifts: { id: string; label: string; time: string; active: boolean }[]

  gatewayHealth: { k: string; v: string; ok: boolean }[]

  thresholds: Record<string, number>
}

export interface Health {
  status: string

  service: string

  version: string

  uptimeSeconds: number

  live: boolean

  tickCount: number

  lastTickAt: string

  machines: number

  alertsOpen: number
}

/* =========================================================================
 * Competition Mode (demo determinístico) — server/scenario.mjs
 * ========================================================================= */

export type ScenarioId = "NORMAL" | "IDLE" | "ANOMALY" | "THERMAL" | "OFFLINE" | "RECOVERY"

export type Quality = "GOOD" | "MISSING" | "ESTIMATED" | "OUTLIER" | "DUPLICATE"

export interface ScenarioMeta {
  id: ScenarioId

  label: string

  target: string | null

  note: string
}

export interface DemoMachine {
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

  quality: Quality

  online: boolean

  power: number

  voltage: number

  current: number

  powerFactor: number

  temperature: number

  consumption: number

  idleMinutes?: number

  idleCostDay?: number

  deviationPct?: number

  anomalyDesc?: string

  lastUpdate: string
}

export interface DemoAlert {
  id: string

  key?: string

  machine: string

  machineId: string

  sector: string

  anomaly: string

  anomalyType: string

  condition?: string

  evidence?: string

  severity: Severity

  status: AlertStatus

  message?: string

  simulated?: boolean

  detectedAt: string
}

export interface DemoIntervention {
  id: string

  machineId: string

  description: string

  before: number

  after: number

  saved: number

  simulated?: boolean

  createdAt: string
}

export interface DemoKpis {
  energyKwh: number

  costBrl: number

  wasteKwh: number

  wasteBrl: number

  alerts: number

  machines: number

  idleMachines: number

  anomalyMachines: number

  offlineMachines: number

  criticalMachine: string | null

  criticalMachineName: string | null

  savingsBrl: number

  estimated: boolean
}

export interface BeforeAfter {
  machineId: string

  machine: string

  beforeKwhDay: number

  afterKwhDay: number

  beforeBrlDay: number

  afterBrlDay: number

  savedKwhDay: number

  savedBrlDay: number

  savedBrlMonth: number

  estimated: boolean

  note: string
}

export interface DemoAnalytics {
  simulated: boolean

  scenario: ScenarioId

  step: number

  idle: {
    machines: {
      machineId: string
      state: MachineState
      powerKw: number
      idleMinutes: number
      idleEnergyKwh: number
      idleCostDay: number
      deviationPct: number
    }[]

    totalIdleEnergyKwh: number

    totalIdleCost: number

    estimated: boolean
  }

  anomalies: {
    machineId: string
    machine: string
    type: string
    severity: Severity
    desc: string
    condition: string
    deviationPct: number
  }[]

  cost: {
    ratePerKwh: number
    perMachine: { machineId: string; energyKwh: number; cost: number }[]
    estimated: boolean
    note: string
  }
}

export interface CompetitionStatus {
  simulated: boolean

  deterministic: boolean

  scenario: ScenarioId

  scenarioLabel: string

  targetMachine: string | null

  note: string

  step: number

  scenarios: ScenarioMeta[]

  kpis: DemoKpis

  alerts: DemoAlert[]

  interventions: DemoIntervention[]

  beforeAfter: BeforeAfter | null

  machines?: DemoMachine[]

  analytics?: DemoAnalytics
}

export interface TelemetryPoint {
  ts: string

  powerKw: number

  temperatureC: number

  voltageV: number

  state: MachineState

  quality: Quality
}

/* =========================================================================
 * Módulo protocolar — server/protocol.mjs + store
 * ========================================================================= */

export type ProtocolStatus = "open" | "in_progress" | "pending_validation" | "closed" | "cancelled"

export type ProtocolPriority = "critical" | "high" | "medium" | "low"

export type SlaState = "met" | "at_risk" | "breached" | "running" | "cancelled"

export interface ProtocolEvent {
  at: string

  type: string

  actor: string

  note: string
}

export interface Protocol {
  id: string

  title: string

  machineId: string

  machine: string

  sector: string

  origin: string

  priority: ProtocolPriority

  status: ProtocolStatus

  alertId: string | null

  assignee: string

  description: string

  openedAt: string

  closedAt: string | null

  deadline: string

  sla: SlaState

  slaLabel: string

  slaHours: number

  hoursToDeadline: number

  evidence: string[]

  events: ProtocolEvent[]
}

export interface ProtocolsSummary {
  total: number

  open: number

  byStatus: Record<ProtocolStatus, number>

  bySla: Record<"running" | "at_risk" | "breached" | "met", number>

  criticalOpen: number
}
