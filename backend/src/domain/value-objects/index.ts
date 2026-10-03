/**
 * EnergyMatrix EMS - value objects do dominio.
 *
 * `erasableSyntaxOnly` esta ligado: nada de `enum`/`namespace`, apenas
 * uniões de literais + listas `as const` (compativel com o type stripping
 * nativo do Node 22+/24, que executa o backend sem passo de build).
 */

/** Estados de ENERGIA (State Engine, secao 11.1): limiar + histerese. */
export const ENERGY_STATES = ["STOPPED", "IDLE", "RUNNING"] as const
export type EnergyState = (typeof ENERGY_STATES)[number]

/**
 * Estados da MAQUINA (API, D18): o estado de energia sobreposto por
 * ANOMALY (desvio), OFFLINE (ausencia > P2) e MAINTENANCE (manual).
 * Prioridade: MAINTENANCE > OFFLINE > ANOMALY > estado de energia.
 */
export const MACHINE_STATES = ["STOPPED", "IDLE", "RUNNING", "ANOMALY", "OFFLINE", "MAINTENANCE"] as const
export type MachineState = (typeof MACHINE_STATES)[number]

/** Mantido por compatibilidade com contratos legados do prototipo (OFF == STOPPED). */
export type LegacyMachineState = "OFF"

export const DATA_QUALITIES = ["GOOD", "MISSING", "ESTIMATED", "OUTLIER", "DUPLICATE"] as const
export type DataQuality = (typeof DATA_QUALITIES)[number]

export const TELEMETRY_SOURCES = ["REAL", "SIMULATED"] as const
export type TelemetrySource = (typeof TELEMETRY_SOURCES)[number]

/** RBAC (D13): o prompt prevalece sobre ADMIN/MANAGER/OPERATOR do plano. */
export const USER_ROLES = ["ADMIN", "ACCOUNTING", "MACHINE_EVALUATOR"] as const
export type UserRole = (typeof USER_ROLES)[number]

export const USER_STATUSES = ["active", "invited", "disabled"] as const
export type UserStatus = (typeof USER_STATUSES)[number]

export const TENANT_STATUSES = ["active", "suspended"] as const
export type TenantStatus = (typeof TENANT_STATUSES)[number]

/** Tipos de MachineEvent (secao 11.1). */
export const MACHINE_EVENT_TYPES = [
  "STARTED",
  "STOPPED",
  "IDLE",
  "POWER_HIGH",
  "POWER_LOW",
  "TEMPERATURE_HIGH",
  "OFFLINE",
  "RECOVERY",
  "ANOMALY",
] as const
export type MachineEventType = (typeof MACHINE_EVENT_TYPES)[number]

export const EVENT_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const
export type EventSeverity = (typeof EVENT_SEVERITIES)[number]

/**
 * Relacoes entre maquinas (D1): convencao source -> target.
 * `propagates` indica se a relacao propaga impacto e em que direcao.
 */
export const RELATIONSHIP_TYPES = ["SUPPLIES", "FEEDS", "DEPENDS_ON", "FOLLOWS", "COUPLED", "PARALLEL", "BACKUP"] as const
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number]

/** Direcao do impacto por tipo (secao 11.2): downstream a montante ou a jusante. */
export const RELATIONSHIP_IMPACT: Readonly<Record<RelationshipType, { propagates: boolean; direction: "source_to_target" | "target_to_source" | "none" }>> = {
  SUPPLIES: { propagates: true, direction: "source_to_target" },
  FEEDS: { propagates: true, direction: "source_to_target" },
  DEPENDS_ON: { propagates: true, direction: "target_to_source" },
  FOLLOWS: { propagates: true, direction: "target_to_source" },
  COUPLED: { propagates: false, direction: "none" },
  PARALLEL: { propagates: false, direction: "none" },
  BACKUP: { propagates: false, direction: "none" },
}

export const DEPENDENCY_LEVELS = [1, 2, 3] as const
export type DependencyLevel = (typeof DEPENDENCY_LEVELS)[number]

/** Classificacao de evidencia/impacto (secoes 11.3 e 12.1). */
export const IMPACT_CLASSIFICATIONS = ["OBSERVED", "ESTIMATED", "SIMULATED"] as const
export type ImpactClassification = (typeof IMPACT_CLASSIFICATIONS)[number]

export const ALERT_SEVERITIES = ["critical", "high", "medium"] as const
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number]

export const ALERT_STATUSES = ["open", "acknowledged", "resolved"] as const
export type AlertStatus = (typeof ALERT_STATUSES)[number]

export const PROTOCOL_STATUSES = [
  "open",
  "in_progress",
  "pending_validation",
  "closed",
  "cancelled",
] as const
export type ProtocolStatus = (typeof PROTOCOL_STATUSES)[number]

export const PROTOCOL_PRIORITIES = ["critical", "high", "medium", "low"] as const
export type ProtocolPriority = (typeof PROTOCOL_PRIORITIES)[number]

export const SLA_HOURS: Readonly<Record<ProtocolPriority, number>> = {
  critical: 4,
  high: 24,
  medium: 72,
  low: 168,
}

export const PROTOCOL_STATUS_LABELS: Readonly<Record<ProtocolStatus, string>> = {
  open: "Aberto",
  in_progress: "Em tratamento",
  pending_validation: "Aguardando validação",
  closed: "Encerrado",
  cancelled: "Cancelado",
}

export const PROTOCOL_PRIORITY_LABELS: Readonly<Record<ProtocolPriority, string>> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
}

export const SLA_STATES = ["met", "at_risk", "breached", "running", "cancelled"] as const
export type SlaState = (typeof SLA_STATES)[number]

export const PROTOCOL_ORIGINS = [
  "Alerta automático",
  "Inspeção de rotina",
  "Solicitação do cliente",
  "Auditoria",
  "Manutenção preventiva",
  "Outro",
] as const
export type ProtocolOrigin = (typeof PROTOCOL_ORIGINS)[number]

export const PROTOCOL_EVENT_TYPES = [
  "abertura",
  "tratativa",
  "evidência",
  "validação",
  "encerramento",
  "cancelamento",
  "comentário",
] as const
export type ProtocolEventType = (typeof PROTOCOL_EVENT_TYPES)[number]

/** Cenarios do demo (secao 10.1): os 6 do prototipo + CASCADE_IDLE (D19). */
export const SCENARIOS = ["NORMAL", "IDLE", "ANOMALY", "THERMAL", "OFFLINE", "RECOVERY", "CASCADE_IDLE"] as const
export type ScenarioId = (typeof SCENARIOS)[number]

export function isMachineState(value: unknown): value is MachineState {
  return MACHINE_STATES.includes(value as MachineState)
}

export function isScenarioId(value: unknown): value is ScenarioId {
  return SCENARIOS.includes(value as ScenarioId)
}

export function isAlertSeverity(value: unknown): value is AlertSeverity {
  return ALERT_SEVERITIES.includes(value as AlertSeverity)
}

export function isProtocolStatus(value: unknown): value is ProtocolStatus {
  return PROTOCOL_STATUSES.includes(value as ProtocolStatus)
}

export function isProtocolPriority(value: unknown): value is ProtocolPriority {
  return PROTOCOL_PRIORITIES.includes(value as ProtocolPriority)
}

export function isProtocolOrigin(value: unknown): value is ProtocolOrigin {
  return PROTOCOL_ORIGINS.includes(value as ProtocolOrigin)
}

export function isProtocolEventType(value: unknown): value is ProtocolEventType {
  return PROTOCOL_EVENT_TYPES.includes(value as ProtocolEventType)
}

/** Mapeia a severidade de um alerta para a prioridade protocolar. */
export function priorityFromSeverity(severity: AlertSeverity | string): ProtocolPriority {
  if (severity === "critical") return "critical"
  if (severity === "high") return "high"
  if (severity === "medium") return "medium"
  return "low"
}

/** Inverso: prioridade protocolar -> severidade de alerta. */
export function severityFromPriority(priority: ProtocolPriority | string): AlertSeverity {
  if (priority === "critical") return "critical"
  if (priority === "high") return "high"
  return "medium"
}