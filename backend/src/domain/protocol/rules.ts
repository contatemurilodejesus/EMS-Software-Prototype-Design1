/**
 * EnergyMatrix EMS - regras do MODULO PROTOCOLAR (funcoes puras).
 *
 * Cada ocorrencia do EMS gera um PROTOCOLO numerado (EMS-AAAA-NNNN) com
 * ciclo de vida auditavel, SLA por prioridade, responsavel e evidencias.
 * Sem dependencia de HTTP, banco ou relogio do sistema: `now` e parametro.
 */

import type { Protocol, ProtocolEvent } from "../entities/index.ts"
import type { ProtocolEventType, ProtocolPriority, ProtocolStatus, SlaState } from "../value-objects/index.ts"
import { PROTOCOL_PRIORITIES, SLA_HOURS } from "../value-objects/index.ts"
import { formatIsoLocal, parseIso } from "../../shared/utils/index.ts"

/** Numero protocolar sequencial: EMS-AAAA-NNNN. */
export function protocolNumber(year: number, seq: number): string {
  return `EMS-${year}-${String(seq).padStart(4, "0")}`
}

/** Ciclo de vida linear (ordem de avanco automatico). */
export const PROTOCOL_LIFECYCLE: readonly ProtocolStatus[] = [
  "open",
  "in_progress",
  "pending_validation",
  "closed",
]

/** Evento de auditoria correspondente a cada estado. */
export const EVENT_TYPE_FOR_STATUS: Readonly<Record<ProtocolStatus, ProtocolEventType>> = {
  open: "abertura",
  in_progress: "tratativa",
  pending_validation: "validação",
  closed: "encerramento",
  cancelled: "cancelamento",
}

/** Prazo (ISO local) a partir da abertura, prioridade e SLA em horas. */
export function computeDeadline(openedAt: string, priority: ProtocolPriority): string {
  const hours = SLA_HOURS[priority] ?? SLA_HOURS.medium
  const opened = parseIso(openedAt, new Date())
  return formatIsoLocal(new Date(opened.getTime() + hours * 3600 * 1000))
}

/** Horas restantes ate o prazo (negativo quando vencido). */
export function hoursToDeadline(deadline: string, now: Date): number {
  const target = parseIso(deadline, now)
  return Number(((target.getTime() - now.getTime()) / 3_600_000).toFixed(1))
}

/**
 * Situacao do SLA:
 *  met (cumprido) | at_risk (<= 25% restante) | breached (vencido) |
 *  running (em curso) | cancelled.
 */
export function slaState(
  protocol: Pick<Protocol, "deadline" | "openedAt" | "closedAt" | "status">,
  now: Date,
): SlaState {
  const deadline = parseIso(protocol.deadline, now).getTime()
  const opened = parseIso(protocol.openedAt, now).getTime()

  if (protocol.closedAt) {
    const closed = parseIso(protocol.closedAt, now).getTime()
    return closed <= deadline ? "met" : "breached"
  }
  if (protocol.status === "cancelled") return "cancelled"
  if (now.getTime() > deadline) return "breached"

  const total = Math.max(1, deadline - opened)
  if ((deadline - now.getTime()) / total <= 0.25) return "at_risk"
  return "running"
}

export function slaLabel(state: SlaState): string {
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

/** Fabrica de um evento da trilha de auditoria. */
export function makeEvent(
  type: ProtocolEventType,
  actor: string | undefined,
  note: string | undefined,
  at: Date,
): ProtocolEvent {
  return { at: formatIsoLocal(at), type, actor: actor || "Operador EMS", note: note ?? "" }
}

/** Numero do proximo protocolo a partir da lista existente. */
export function nextSequence(protocols: { id: string }[], year: number): number {
  const prefix = `EMS-${year}-`
  return protocols.filter((p) => String(p.id).startsWith(prefix)).length + 1
}

/** Proximo estado do ciclo (ou o atual quando nao ha proximo). */
export function nextStatus(status: ProtocolStatus): ProtocolStatus {
  return PROTOCOL_LIFECYCLE[PROTOCOL_LIFECYCLE.indexOf(status) + 1] ?? status
}

export function isProtocolPriority(value: unknown): value is ProtocolPriority {
  return PROTOCOL_PRIORITIES.includes(value as ProtocolPriority)
}