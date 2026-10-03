/**
 * Application service - ALERTAS (ciclo ABERTO -> RECONHECIDO -> RESOLVIDO).
 *
 * Tambem implementa a porta `AlertSink` usada pela ingestao: quando o motor
 * analitico passa a ANOMALY, o alerta e aberto com EVIDENCIA (descricao +
 * condicao), sem afirmar falha especifica do equipamento.
 */

import { formatDateTime, formatTime } from "../../shared/utils/index.ts"
import { NotFoundError, ERROR_CODES } from "../../domain/errors/index.ts"
import type { Alert, Anomaly, MachineRecord } from "../../domain/entities/index.ts"
import type { AlertQuery } from "../../domain/ports/index.ts"
import type { MachineState } from "../../domain/value-objects/index.ts"
import type { ServiceContext } from "../context.ts"

const LIFECYCLE = ["open", "acknowledged", "resolved"] as const
const AUTO_ACTION = "Acionar equipe de manutenção e inspecionar o equipamento."

export function createAlertService(ctx: ServiceContext) {
  const log = ctx.logger.child({ service: "AlertService" })

  async function list(query: AlertQuery = {}): Promise<Alert[]> {
    return ctx.alerts.list(query)
  }

  async function findById(id: string): Promise<Alert> {
    const alert = await ctx.alerts.findById(id)
    if (!alert) throw new NotFoundError(`Alerta ${id} não encontrado`, ERROR_CODES.ALERT_NOT_FOUND)
    return alert
  }

  /** Sequencial do contrato: ALT-2026-NNNN (offset 42, como no prototipo). */
  async function nextId(): Promise<string> {
    const alerts = await ctx.alerts.list({})
    const seq = 42 + alerts.filter((a) => a.id.startsWith("ALT-2026-")).length
    return `ALT-2026-${String(seq).padStart(4, "0")}`
  }

  /** Abertura automatica a partir de uma anomalia detectada na ingestao. */
  async function openFromAnomaly(input: {
    machine: MachineRecord
    state: MachineState
    anomalies: Anomaly[]
    at: Date
  }): Promise<Alert | null> {
    if (!input.anomalies.length || input.state !== "ANOMALY") return null

    const primary = input.anomalies.find((a) => a.severity === "critical") ?? input.anomalies[0]

    const alert: Alert = {
      id: await nextId(),
      machine: input.machine.name,
      machineId: input.machine.id,
      sector: input.machine.sector,
      anomaly: primary.desc,
      anomalyType: primary.type,
      condition: primary.condition,
      peakTime: `${formatTime(input.at)} – contínuo`,
      severity: primary.severity,
      status: "open",
      action: AUTO_ACTION,
      detectedAt: formatDateTime(input.at),
      auto: true,
    }

    await ctx.alerts.save(alert)
    log.warn("Alerta automatico aberto", { alertId: alert.id, machineId: alert.machineId })

    return alert
  }

  /** Avanca o ciclo de vida; devolve o alerta atualizado. */
  async function advance(
    id: string,
    options: { assignee?: string } = {},
  ): Promise<Alert> {
    const alert = await findById(id)
    const next = LIFECYCLE[LIFECYCLE.indexOf(alert.status) + 1]

    if (!next) return alert

    const patch: Partial<Alert> = { status: next }
    if (next === "acknowledged") {
      patch.acknowledgedAt = formatDateTime(ctx.clock.now())
      patch.assignee = options.assignee ?? alert.assignee ?? "Operador EMS"
    }
    if (next === "resolved") {
      patch.resolvedAt = formatDateTime(ctx.clock.now())
      patch.assignee = options.assignee ?? alert.assignee ?? "Operador EMS"
    }

    const updated = await ctx.alerts.update(id, patch)
    if (!updated) throw new NotFoundError(`Alerta ${id} não encontrado`, ERROR_CODES.ALERT_NOT_FOUND)

    log.info("Alerta avancado", { alertId: id, status: updated.status })
    return updated
  }

  /** Contagens por severidade/status (badge do cabecalho e modulo Alertas). */
  async function summary() {
    const alerts = await ctx.alerts.list({})
    const active = (a: Alert) => a.status !== "resolved"

    return {
      total: alerts.length,
      openCritical: alerts.filter((a) => a.severity === "critical" && active(a)).length,
      openIdle: alerts.filter((a) => a.anomalyType === "Consumo Improdutivo" && active(a)).length,
      bySeverity: {
        critical: alerts.filter((a) => a.severity === "critical" && active(a)).length,
        high: alerts.filter((a) => a.severity === "high" && active(a)).length,
        medium: alerts.filter((a) => a.severity === "medium" && active(a)).length,
      },
    }
  }

  async function countOpen(): Promise<number> {
    return ctx.alerts.countOpen()
  }

  return { list, findById, advance, summary, countOpen, openFromAnomaly }
}

export type AlertService = ReturnType<typeof createAlertService>