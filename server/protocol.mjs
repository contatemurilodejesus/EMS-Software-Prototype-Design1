/**
 * EnergyMatrix EMS — domínio do MÓDULO PROTOCOLAR.
 *
 * Formaliza a tratativa de ocorrências: cada anomalia/desvio detectado pelo EMS
 * gera um PROTOCOLO numerado com ciclo de vida auditável, SLA, responsável,
 * evidências e assinaturas (abertura/execução/validação/encerramento).
 *
 * Funções puras — compartilhadas pelo store em memória (server/store.mjs).
 */

/** Ciclo de vida protocolar. */

export const PROTOCOL_STATUSES = [
  "open",
  "in_progress",
  "pending_validation",
  "closed",
  "cancelled",
]

/** Rótulos do ciclo de vida (pt-BR). */

export const PROTOCOL_STATUS_LABELS = {
  open: "Aberto",

  in_progress: "Em tratamento",

  pending_validation: "Aguardando validação",

  closed: "Encerrado",

  cancelled: "Cancelado",
}

/** Prioridades e SLA máximo de tratativa (horas). */

export const PROTOCOL_PRIORITIES = ["critical", "high", "medium", "low"]

export const PROTOCOL_PRIORITY_LABELS = {
  critical: "Crítica",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
}

export const SLA_HOURS = { critical: 4, high: 24, medium: 72, low: 168 }

/** Origens possíveis de um protocolo. */

export const PROTOCOL_ORIGINS = [
  "Alerta automático",
  "Inspeção de rotina",
  "Solicitação do cliente",
  "Auditoria",
  "Manutenção preventiva",
  "Outro",
]

/** Tipos de evento da trilha de auditoria. */

export const PROTOCOL_EVENT_TYPES = [
  "abertura",
  "tratativa",
  "evidência",
  "validação",
  "encerramento",
  "cancelamento",
  "comentário",
]

/** Mapeia a severidade de um alerta para a prioridade protocolar. */

export function priorityFromSeverity(severity) {
  if (severity === "critical") return "critical"

  if (severity === "high") return "high"

  if (severity === "medium") return "medium"

  return "low"
}

/** Inverso: prioridade protocolar → severidade de alerta. */

export function severityFromPriority(priority) {
  if (priority === "critical") return "critical"

  if (priority === "high") return "high"

  return "medium"
}

/** Número protocolar sequencial: EMS-AAAA-NNNN. */

export function protocolNumber(year, seq) {
  return `EMS-${year}-${String(seq).padStart(4, "0")}`
}

/**
 * Data/hora ISO local (yyyy-mm-ddThh:mm:ss) — base da aritmética de SLA.
 * Mantida independente de fuso (UTC) para que o cálculo de prazo seja estável.
 */

export function isoLocal(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)

  const p = (n) => String(n).padStart(2, "0")

  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Converte ISO local em Date (fallback: agora). */

export function parseIso(value) {
  const d = new Date(value)

  return Number.isNaN(d.getTime()) ? new Date() : d
}

/** Prazo (ISO) a partir da abertura, prioridade e SLA em horas. */

export function computeDeadline(openedAt, priority) {
  const hours = SLA_HOURS[priority] ?? SLA_HOURS.medium

  return isoLocal(new Date(parseIso(openedAt).getTime() + hours * 3600 * 1000))
}

/** Horas restantes até o prazo (negativo quando vencido). */

export function hoursToDeadline(deadline, now = Date.now()) {
  return Number(((parseIso(deadline).getTime() - now) / 3600000).toFixed(1))
}

/**
 * Situação do SLA: `met` (cumprido), `at_risk` (≤ 25% do prazo restante),
 * `breached` (vencido), `running` (em curso).
 */

export function slaState(protocol, now = Date.now()) {
  const deadline = parseIso(protocol.deadline).getTime()

  const opened = parseIso(protocol.openedAt).getTime()

  if (protocol.closedAt) {
    const closed = parseIso(protocol.closedAt).getTime()

    return closed <= deadline ? "met" : "breached"
  }

  if (protocol.status === "cancelled") return "cancelled"

  if (now > deadline) return "breached"

  const total = Math.max(1, deadline - opened)

  if ((deadline - now) / total <= 0.25) return "at_risk"

  return "running"
}

export function slaLabel(state) {
  return (
    {
      met: "SLA cumprido",
      at_risk: "SLA em risco",
      breached: "SLA violado",
      running: "SLA em curso",
      cancelled: "Cancelado",
    }[state] ?? state
  )
}

/** Fábrica de um evento da trilha de auditoria. */

export function makeEvent(type, actor, note, at = isoLocal()) {
  return { at, type, actor: actor || "Operador EMS", note: note ?? "" }
}

/** Número do próximo protocolo a partir da lista existente. */

export function nextSequence(protocols, year = new Date().getFullYear()) {
  const prefix = `EMS-${year}-`

  return protocols.filter((p) => String(p.id).startsWith(prefix)).length + 1
}
