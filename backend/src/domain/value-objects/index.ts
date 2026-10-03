/**
 * EnergyMatrix EMS - value objects do dominio.
 *
 * `erasableSyntaxOnly` esta ligado: nada de `enum`/`namespace`, apenas
 * uniões de literais + listas `as const` (compativel com o type stripping
 * nativo do Node 22+/24, que executa o backend sem passo de build).
 */

export const MACHINE_STATES = ["OFF", "IDLE", "RUNNING", "ANOMALY"] as const
export type MachineState = (typeof MACHINE_STATES)[number]

export const DATA_QUALITIES = ["GOOD", "MISSING", "OUTLIER", "DUPLICATE"] as const
export type DataQuality = (typeof DATA_QUALITIES)[number]

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

export const SCENARIOS = ["NORMAL", "IDLE", "ANOMALY", "THERMAL", "OFFLINE", "RECOVERY"] as const
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