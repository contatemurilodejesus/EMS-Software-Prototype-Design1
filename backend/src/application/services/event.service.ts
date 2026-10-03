/**
 * Application service - EVENTOS DE MAQUINA e ANALISE DE IMPACTO
 * (secoes 11.1 e 11.3).
 *
 * Eventos: transicoes do estado de energia, POWER_HIGH/LOW, TEMPERATURE_HIGH,
 * OFFLINE, RECOVERY e ANOMALY. Cada evento carrega severidade e EVIDENCIA
 * (metadata) - o sistema mostra evidencia, nunca afirma falha especifica.
 *
 * Impacto (D2/D21): quando uma maquina entra em STOPPED, percorre-se o grafo
 * para baixo; maquinas a jusante em IDLE acima da janela minima geram energia
 * evitavel = integral de (potencia - P_OFF) x tarifa, com classificacao
 * OBSERVED/ESTIMATED/SIMULATED e alerta de "possivel desperdicio".
 */

import {
  ERROR_CODES,
  NotFoundError,
  ValidationError,
} from "../../domain/errors/index.ts"
import type {
  Alert,
  ImpactAnalysis,
  MachineEvent,
  MachineRecord,
} from "../../domain/entities/index.ts"
import type {
  EnergyState,
  EventSeverity,
  ImpactClassification,
  MachineEventType,
} from "../../domain/value-objects/index.ts"
import { toNumber } from "../../shared/utils/index.ts"
import { currentTenantId } from "../../shared/tenant-context.ts"
import type { RelationshipService } from "./relationship.service.ts"
import type { ServiceContext } from "../context.ts"

export interface EventDependencies {
  relationships: RelationshipService
  /** Janela minima (min) em IDLE a jusante para considerar impacto (P1). */
  impactMinWindowMinutes: number
}

export interface RecordEventInput {
  machineId: string
  type: MachineEventType
  severity: EventSeverity
  metadata?: Record<string, unknown>
}

export interface ImpactRequest {
  /** Maquina que parou (origem da cascata). */
  machineId: string
  /** Janela de analise; padrao = desde a parada ate agora. */
  windowStart?: string
  windowEnd?: string
  /** Sobrescreve a leitura de potencia a jusante (usado nos cenarios). */
  downstreamPowerKw?: Record<string, number>
}

/** Estados de energia que viram evento de transicao. */
const TRANSITION_EVENT: Readonly<Record<EnergyState, MachineEventType>> = {
  RUNNING: "STARTED",
  IDLE: "IDLE",
  STOPPED: "STOPPED",
}

/** Limiar de alerta de possivel desperdicio (kWh evitaveis). */
export const IMPACT_ALERT_KWH = 0.5

export function createEventService(ctx: ServiceContext, deps: EventDependencies) {
  const log = ctx.logger.child({ service: "EventService" })

  async function list(query: { machineId?: string; type?: string; severity?: string; limit?: number } = {}) {
    return ctx.machineEvents.list(currentTenantId(), query)
  }

  async function findById(id: string): Promise<MachineEvent> {
    const found = await ctx.machineEvents.findById(id, currentTenantId())
    if (!found) {
      throw new NotFoundError(`Evento ${id} nao encontrado`, ERROR_CODES.EVENT_NOT_FOUND)
    }
    return found
  }

  /** Grava um evento com evidencia (id sequencial deterministico). */
  async function record(input: RecordEventInput): Promise<MachineEvent> {
    const now = ctx.clock.now()
    const machine = await ctx.machines.findById(input.machineId)
    if (!machine) {
      throw new NotFoundError(`Maquina ${input.machineId} nao encontrada`, ERROR_CODES.MACHINE_NOT_FOUND)
    }

    const event: MachineEvent = {
      id: `evt-${now.getTime()}-${machine.id}-${input.type}`,
      tenantId: machine.tenantId ?? currentTenantId(),
      machineId: machine.id,
      type: input.type,
      severity: input.severity,
      timestamp: now.toISOString(),
      metadata: { machineName: machine.name, ...input.metadata },
      createdAt: now.toISOString(),
    }

    await ctx.machineEvents.save(event)
    return event
  }

  /**
   * Traduz uma mudanca de estado da ingestao em evento de transicao.
   * `RECOVERY` tem precedencia quando a maquina volta de OFFLINE/ANOMALY.
   */
  async function recordStateTransition(input: {
    machine: MachineRecord
    previous?: string
    current: string
    at: Date
    anomalies?: { desc: string; condition: string; severity: string }[]
  }): Promise<MachineEvent | null> {
    const previous = input.previous
    if (!previous || previous === input.current) return null

    const recovering = previous === "OFFLINE" || previous === "ANOMALY"

    const type: MachineEventType = recovering
      ? "RECOVERY"
      : (TRANSITION_EVENT[input.current as EnergyState] ?? null)

    if (!type) return null

    const severity: EventSeverity = type === "STOPPED" ? "WARNING" : "INFO"

    const event: MachineEvent = {
      id: `evt-${input.at.getTime()}-${input.machine.id}-${type}`,
      tenantId: input.machine.tenantId ?? currentTenantId(),
      machineId: input.machine.id,
      type,
      severity,
      timestamp: input.at.toISOString(),
      metadata: {
        machineName: input.machine.name,
        from: previous,
        to: input.current,
        evidence: input.anomalies?.map((a) => a.condition) ?? [],
      },
      createdAt: input.at.toISOString(),
    }

    await ctx.machineEvents.save(event)
    log.debug("Evento de transicao gravado", { machineId: input.machine.id, type })

    return event
  }

  /** Classificacao da evidencia: SIMULATED vence qualquer outra (secao 12.1). */
  function classify(sources: Set<string>): ImpactClassification {
    if (sources.has("SIMULATED")) return "SIMULATED"
    if (sources.has("REAL")) return "OBSERVED"
    return "ESTIMATED"
  }

  /**
   * Analise de impacto (D2/D21): maquina parada + maquinas a jusante em IDLE
   * acima da janela minima -> energia evitavel, custo e alerta opcional.
   */
  async function analyzeImpact(request: ImpactRequest): Promise<ImpactAnalysis> {
    const tenant = currentTenantId()
    const origin = await ctx.machines.findById(request.machineId)

    if (!origin) {
      throw new NotFoundError(`Maquina ${request.machineId} nao encontrada`, ERROR_CODES.MACHINE_NOT_FOUND)
    }

    const now = ctx.clock.now()
    const windowEnd = request.windowEnd ? new Date(request.windowEnd) : now
    const windowStart = request.windowStart
      ? new Date(request.windowStart)
      : new Date(windowEnd.getTime() - deps.impactMinWindowMinutes * 60000)

    if (windowStart.getTime() >= windowEnd.getTime()) {
      throw new ValidationError("A janela de analise precisa ter inicio antes do fim")
    }

    const downstreamIds = await deps.relationships.downstreamOf(origin.id)
    const tariff = await ctx.config.getTariff()
// Tarifa ativa e por tenant; o seed rotula o valor como ESTIMATIVA (secao 12.1).
    const rate = toNumber(tariff?.intermediate ?? 0)

    const windowMinutes = (windowEnd.getTime() - windowStart.getTime()) / 60000
    const sources = new Set<string>()
    const affected: {
      machineId: string
      machineName: string
      powerKw: number
      pOffKw: number
      avoidableKwh: number
      classification: ImpactClassification
    }[] = []

    let avoidableKwh = 0

    for (const id of downstreamIds) {
      const machine = await ctx.machines.findById(id)
      if (!machine) continue

      const interval = await ctx.machineStates.current(id)
      const isIdle = interval?.state === "IDLE"
      const idleMinutes = isIdle ? await ctx.machineStates.idleMinutes(id, now) : 0

      if (!isIdle || idleMinutes < deps.impactMinWindowMinutes) continue

      const powerKw = request.downstreamPowerKw?.[id] ?? toNumber(machine.power)
      const pOffKw = toNumber(machine.pOff)
      const avoidable = Math.max(0, (powerKw - pOffKw) * (windowMinutes / 60))

      // Telemetria do simulador e sempre SIMULATED (secao 10).
      const classification: ImpactClassification = "SIMULATED"
      sources.add("SIMULATED")

      avoidableKwh += avoidable
      affected.push({
        machineId: machine.id,
        machineName: machine.name,
        powerKw: Number(powerKw.toFixed(2)),
        pOffKw,
        avoidableKwh: Number(avoidable.toFixed(3)),
        classification,
      })
    }

    const estimatedCost = Number((avoidableKwh * rate).toFixed(2))
    const classification = classify(sources)

    const analysis: ImpactAnalysis = {
      id: `imp-${now.getTime()}-${origin.id}`,
      tenantId: tenant,
      triggerEventId: null,
      machineId: origin.id,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      avoidableKwh: Number(avoidableKwh.toFixed(3)),
      estimatedCost,
      classification,
      evidence: {
        originMachine: origin.name,
        stoppedAt: windowStart.toISOString(),
        windowMinutes: Number(windowMinutes.toFixed(1)),
        minWindowMinutes: deps.impactMinWindowMinutes,
        tariffPerKwh: rate,
        downstream: affected,
        provenance: classification,
        note: "Energia evitavel estimada em maquinas a jusante em IDLE com a montante parada. Correlacao, nao diagnostico de falha.",
      },
      alertId: null,
      createdAt: now.toISOString(),
    }

    await ctx.impactAnalyses.save(analysis)

    let alert: Alert | null = null
    if (avoidableKwh >= IMPACT_ALERT_KWH) {
      alert = await openWasteAlert(analysis, origin, affected)
    }

    log.info("Analise de impacto registrada", {
      machineId: origin.id,
      avoidableKwh: analysis.avoidableKwh,
      classification,
    })

    return alert ? { ...analysis, alertId: alert.id } : analysis
  }

  /** Alerta de "possivel desperdicio" com as evidencias do calculo (D2). */
  async function openWasteAlert(
    analysis: ImpactAnalysis,
    origin: MachineRecord,
    affected: { machineId: string; machineName: string; avoidableKwh: number }[],
  ): Promise<Alert> {
    const now = ctx.clock.now()
    const alerts = await ctx.alerts.list({})
    const seq = 42 + alerts.length + 1
    const start = new Date(analysis.windowStart)
    const hh = String(start.getHours()).padStart(2, "0")
    const mm = String(start.getMinutes()).padStart(2, "0")

    const alert: Alert = {
      id: `ALT-IMP-${String(seq).padStart(4, "0")}`,
      tenantId: analysis.tenantId,
      machine: origin.name,
      machineId: origin.id,
      sector: origin.sector,
      anomaly: "Possivel desperdicio em maquinas a jusante",
      anomalyType: "Consumo Improdutivo",
      condition: `${origin.name} parada; ${affected.length} maquina(s) a jusante em IDLE: ${affected
        .map((a) => `${a.machineName} (~${a.avoidableKwh} kWh evitaveis)`)
        .join(", ")}`,
      peakTime: `${hh}:${mm} - fim da janela`,
      severity: "high",
      status: "open",
      action:
        "Verificar se as maquinas a jusante podem ser pausadas ou desenergizadas enquanto a montante estiver parada.",
      detectedAt: now.toISOString(),
      estimated: true,
      classification: analysis.classification,
      avoidableKwh: analysis.avoidableKwh,
      estimatedCost: analysis.estimatedCost,
      evidence: analysis.evidence as Record<string, string | number>,
    }

    await ctx.alerts.save(alert)
    log.warn("Alerta de possivel desperdicio aberto", {
      alertId: alert.id,
      avoidableKwh: analysis.avoidableKwh,
    })
    return alert
  }

  async function listImpacts(query: { machineId?: string; limit?: number } = {}) {
    return ctx.impactAnalyses.list(currentTenantId(), query)
  }

  async function findImpact(id: string): Promise<ImpactAnalysis> {
    const found = await ctx.impactAnalyses.findById(id, currentTenantId())
    if (!found) {
      throw new NotFoundError(`Analise ${id} nao encontrada`, ERROR_CODES.IMPACT_NOT_FOUND)
    }
    return found
  }

  return {
    list,
    findById,
    record,
    recordStateTransition,
    analyzeImpact,
    listImpacts,
    findImpact,
  }
}

export type EventService = ReturnType<typeof createEventService>
