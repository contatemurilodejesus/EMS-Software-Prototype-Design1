/**
 * Application service - MODULO PROTOCOLAR.
 *
 * Cada ocorrencia gera um protocolo numerado (EMS-AAAA-NNNN) com ciclo de vida
 * auditavel, SLA derivado por prioridade e trilha de eventos.
 */

import {
  computeDeadline,
  EVENT_TYPE_FOR_STATUS,
  hoursToDeadline,
  makeEvent,
  nextStatus,
  PROTOCOL_LIFECYCLE,
  protocolNumber,
  slaLabel,
  slaState,
} from "../../domain/protocol/rules.ts"
import {
  isProtocolPriority,
  isProtocolOrigin,
  PROTOCOL_STATUSES,
  SLA_HOURS,
} from "../../domain/value-objects/index.ts"
import { NotFoundError, ERROR_CODES } from "../../domain/errors/index.ts"
import { clone, formatIsoLocal } from "../../shared/utils/index.ts"
import type { Protocol, ProtocolEvent } from "../../domain/entities/index.ts"
import type {
  ProtocolEventType,
  ProtocolPriority,
  ProtocolStatus,
} from "../../domain/value-objects/index.ts"
import type { ProtocolQuery } from "../../domain/ports/index.ts"
import type { ServiceContext } from "../context.ts"

export interface ProtocolInput {
  title?: unknown
  machineId?: unknown
  machine?: unknown
  sector?: unknown
  origin?: unknown
  priority?: unknown
  alertId?: unknown
  assignee?: unknown
  description?: unknown
  evidence?: unknown
  actor?: unknown
  note?: unknown
}

export interface AdvanceInput {
  status?: unknown
  actor?: unknown
  note?: unknown
}

export interface EventInput {
  type?: unknown
  actor?: unknown
  note?: unknown
}

export function createProtocolService(ctx: ServiceContext) {
  const log = ctx.logger.child({ service: "ProtocolService" })

  /** Deriva prazo, SLA e horas restantes (regra do dominio protocolar). */
  function decorate(protocol: Protocol): Protocol {
    const deadline = protocol.deadline ?? computeDeadline(protocol.openedAt, protocol.priority)
    const view: Protocol = {
      ...clone(protocol),
      deadline,
      closedAt: protocol.closedAt ?? null,
      slaHours: SLA_HOURS[protocol.priority] ?? SLA_HOURS.medium,
    }

    view.sla = slaState(view, ctx.clock.now())
    view.slaLabel = slaLabel(view.sla)
    view.hoursToDeadline = hoursToDeadline(deadline, ctx.clock.now())

    return view
  }

  async function list(query: ProtocolQuery = {}): Promise<Protocol[]> {
    const records = await ctx.protocols.list({ status: query.status, priority: query.priority })
    let protocols = records.map(decorate)

    if (query.sla && query.sla !== "all") {
      protocols = protocols.filter((p) => p.sla === query.sla)
    }

    return protocols
  }

  async function findById(id: string): Promise<Protocol> {
    const protocol = await ctx.protocols.findById(id)
    if (!protocol) {
      throw new NotFoundError(`Protocolo ${id} não encontrado`, ERROR_CODES.PROTOCOL_NOT_FOUND)
    }
    return decorate(protocol)
  }

  /** Abre protocolo numerado a partir de uma ocorrencia (ou de um alerta). */
  async function create(input: ProtocolInput): Promise<Protocol> {
    const now = ctx.clock.now()
    const year = now.getFullYear()
    const seq = await ctx.protocols.nextSequence(year)

    const protocol: Protocol = {
      id: protocolNumber(year, seq),
      title: String(input.title ?? "Ocorrência registrada"),
      machineId: String(input.machineId ?? ""),
      machine: String(input.machine ?? ""),
      sector: String(input.sector ?? ""),
      origin: isProtocolOrigin(input.origin) ? String(input.origin) : "Outro",
      priority: (isProtocolPriority(input.priority) ? input.priority : "medium") as ProtocolPriority,
      status: "open",
      alertId: input.alertId ? String(input.alertId) : null,
      assignee: String(input.assignee ?? "Operador EMS"),
      description: String(input.description ?? ""),
      openedAt: formatIsoLocal(now),
      evidence: Array.isArray(input.evidence) ? input.evidence.map((e) => String(e)) : [],
      events: [
        makeEvent(
          "abertura",
          input.actor as string | undefined,
          (input.note as string | undefined) ?? "Protocolo aberto.",
          now,
        ),
      ],
    }

    const saved = await ctx.protocols.save(protocol)
    log.info("Protocolo aberto", { protocolId: saved.id, priority: saved.priority })

    return decorate(saved)
  }

  /** Avanca o ciclo de vida (ou aplica o status informado). */
  async function advance(id: string, input: AdvanceInput = {}): Promise<Protocol> {
    const protocol = await ctx.protocols.findById(id)
    if (!protocol) {
      throw new NotFoundError(`Protocolo ${id} não encontrado`, ERROR_CODES.PROTOCOL_NOT_FOUND)
    }

    if (protocol.status === "closed" || protocol.status === "cancelled") {
      return decorate(protocol)
    }

    const requested = input.status as ProtocolStatus | undefined
    const next =
      requested && PROTOCOL_STATUSES.includes(requested) ? requested : nextStatus(protocol.status)

    const now = ctx.clock.now()
    const patch: Partial<Protocol> = { status: next }
    if (next === "closed") patch.closedAt = formatIsoLocal(now)

    const updated = await ctx.protocols.update(id, patch)
    if (!updated) {
      throw new NotFoundError(`Protocolo ${id} não encontrado`, ERROR_CODES.PROTOCOL_NOT_FOUND)
    }

    const eventType = EVENT_TYPE_FOR_STATUS[next] ?? "comentário"
    const withEvent = await ctx.protocols.appendEvent(
      id,
      makeEvent(eventType, input.actor as string | undefined, input.note as string | undefined, now),
    )

    log.info("Protocolo avancado", { protocolId: id, status: next })
    return decorate(withEvent ?? updated)
  }

  /** Registra evento avulso na trilha de auditoria. */
  async function addEvent(id: string, input: EventInput = {}): Promise<Protocol> {
    const protocol = await ctx.protocols.findById(id)
    if (!protocol) {
      throw new NotFoundError(`Protocolo ${id} não encontrado`, ERROR_CODES.PROTOCOL_NOT_FOUND)
    }

    const event = makeEvent(
      input.type as ProtocolEventType,
      input.actor as string | undefined,
      input.note as string | undefined,
      ctx.clock.now(),
    ) as ProtocolEvent

    const updated = await ctx.protocols.appendEvent(id, event)
    if (!updated) {
      throw new NotFoundError(`Protocolo ${id} não encontrado`, ERROR_CODES.PROTOCOL_NOT_FOUND)
    }

    log.info("Evento protocolar registrado", { protocolId: id, type: event.type })
    return decorate(updated)
  }

  /** Contagens por status e situacao de SLA (cards do modulo). */
  async function summary() {
    const protocols = await list({})
    const active = (p: Protocol) => p.status !== "closed" && p.status !== "cancelled"

    return {
      total: protocols.length,
      open: protocols.filter(active).length,
      byStatus: {
        open: protocols.filter((p) => p.status === "open").length,
        in_progress: protocols.filter((p) => p.status === "in_progress").length,
        pending_validation: protocols.filter((p) => p.status === "pending_validation").length,
        closed: protocols.filter((p) => p.status === "closed").length,
        cancelled: protocols.filter((p) => p.status === "cancelled").length,
      },
      bySla: {
        running: protocols.filter((p) => p.sla === "running").length,
        at_risk: protocols.filter((p) => p.sla === "at_risk").length,
        breached: protocols.filter((p) => p.sla === "breached").length,
        met: protocols.filter((p) => p.sla === "met").length,
      },
      criticalOpen: protocols.filter((p) => p.priority === "critical" && active(p)).length,
    }
  }

  return { list, findById, create, advance, addEvent, summary, decorate, PROTOCOL_LIFECYCLE }
}

export type ProtocolService = ReturnType<typeof createProtocolService>