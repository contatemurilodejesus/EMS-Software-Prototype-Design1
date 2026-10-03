/**
 * Application service - COMPETITION MODE (cenarios determinísticos).
 *
 * Expoe os casos de uso do demo: ativar cenario, reiniciar, avancar passo,
 * ler maquinas/analytics/telemetria e registrar intervencao simulada.
 */

import { isScenarioId } from "../../domain/value-objects/index.ts"
import { ValidationError, NotFoundError, ERROR_CODES } from "../../domain/errors/index.ts"
import type { ScenarioId } from "../../domain/value-objects/index.ts"
import type { ServiceContext } from "../context.ts"

export interface ScenarioInput {
  scenario?: unknown
  scenarioId?: unknown
}

export interface InterventionInput {
  machineId?: unknown
  before?: unknown
  after?: unknown
  description?: unknown
}

const ANALYTICS_KEYS = ["idle", "anomalies", "cost"] as const

export function createScenarioService(ctx: ServiceContext) {
  const log = ctx.logger.child({ service: "ScenarioService" })

  /** Visao completa do demo: status + 3 maquinas + analytics. */
  async function competition() {
    return ctx.scenarios.snapshot()
  }

  /** Dashboard do demo (mesmo corpo + tarifa vigente). */
  async function dashboard() {
    const snapshot = await ctx.scenarios.snapshot()
    return { ...snapshot, tariff: await ctx.config.getTariff() }
  }

  async function analytics(key?: string) {
    const snapshot = await ctx.scenarios.snapshot()
    const all = snapshot.analytics as unknown as Record<string, unknown>
    if (!key) return all
    if (!ANALYTICS_KEYS.includes(key as (typeof ANALYTICS_KEYS)[number])) return all
    return all[key]
  }

  async function machines() {
    const snapshot = await ctx.scenarios.snapshot()
    return snapshot.machines
  }

  async function machine(id: string) {
    const snapshot = await ctx.scenarios.snapshot()
    const found = snapshot.machines.find((m) => m.id === id)
    if (!found) throw new NotFoundError(`Máquina ${id} não encontrada no demo`)
    return found
  }

  /** Serie determinística reconstruida do passo 0 ate o passo atual. */
  async function telemetry(id: string) {
    const points = await ctx.scenarios.telemetry(id)
    if (!points) throw new NotFoundError(`Máquina ${id} não encontrada no demo`)
    return { machineId: id, simulated: true, points }
  }

  async function status() {
    return ctx.scenarios.snapshot()
  }

  /** Ativa um cenario (qualquer valor invalido cai em NORMAL, como antes). */
  async function setScenario(input: ScenarioInput) {
    const raw = String(input.scenario ?? input.scenarioId ?? "NORMAL").toUpperCase()
    const scenario: ScenarioId = isScenarioId(raw) ? raw : "NORMAL"
    log.info("Cenario ativado", { scenario })
    return ctx.scenarios.setScenario(scenario)
  }

  async function step() {
    return ctx.scenarios.step()
  }

  async function reset() {
    log.info("Demo reiniciado", { scenario: "NORMAL" })
    return ctx.scenarios.reset()
  }

  /** Intervencao do demo (ANTES x DEPOIS) - sempre rotulada como simulada. */
  async function addIntervention(input: InterventionInput) {
    if (!input || Object.keys(input).length === 0) {
      throw new ValidationError("Corpo da intervenção é obrigatório")
    }

    const before = Number(input.before) || 0
    const after = Number(input.after) || 0
    const machineId = input.machineId ? String(input.machineId) : undefined

    const intervention = await ctx.scenarios.addIntervention({
      machineId: machineId ?? "",
      before,
      after,
    })

    log.info("Intervencao simulada registrada", { interventionId: intervention.id })
    return intervention
  }

  async function advanceAlert(id: string) {
    const alert = await ctx.scenarios.advanceAlert(id)
    if (!alert) throw new NotFoundError(`Alerta ${id} não encontrado`, ERROR_CODES.ALERT_NOT_FOUND)
    return alert
  }

  return {
    competition,
    dashboard,
    analytics,
    machines,
    machine,
    telemetry,
    status,
    setScenario,
    step,
    reset,
    addIntervention,
    advanceAlert,
  }
}

export type ScenarioService = ReturnType<typeof createScenarioService>