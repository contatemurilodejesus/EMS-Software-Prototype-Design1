/**
 * Application service - ECONOMIA (CUSUM, oportunidades, intervencoes).
 *
 * Todos os valores economicos sao ESTIMATIVAS do cenario simulado - o
 * documento proibe afirmar economia garantida (secao 21).
 */

import { formatDateTime, toNumber } from "../../shared/utils/index.ts"
import { ValidationError } from "../../domain/errors/index.ts"
import type { Intervention } from "../../domain/entities/index.ts"
import type { ServiceContext } from "../context.ts"

export interface InterventionInput {
  machine?: unknown
  machineId?: unknown
  before?: unknown
  after?: unknown
  desc?: unknown
  date?: unknown
  period?: unknown
  confidence?: unknown
}

/** CUSUM deterministico de 28 dias (intervencao a partir do dia 8). */
export function cusumSeries(days = 28) {
  const out: { dia: number; economy: number; baseline: number; medido: number }[] = []

  for (let i = 0; i < days; i += 1) {
    const day = i + 1
    const intervened = day >= 8

    out.push({
      dia: day,
      economy: intervened ? Math.round(Math.max(0, (day - 7) * 43.7)) : 0,
      baseline: Math.round(580 + Math.sin(i * 0.4) * 30),
      medido: Math.round(
        intervened
          ? 540 + Math.sin(i * 0.4) * 25 - (day - 7) * 1.8
          : 578 + Math.sin(i * 0.4) * 40,
      ),
    })
  }

  return out
}

export function createEconomyService(ctx: ServiceContext) {
  const log = ctx.logger.child({ service: "EconomyService" })

  async function interventions(): Promise<Intervention[]> {
    return ctx.interventions.list()
  }

  /** Registra intervencao ANTES x DEPOIS e calcula a economia estimada. */
  async function addIntervention(input: InterventionInput): Promise<Intervention> {
    const machine = input.machine ?? input.machineId
    if (!machine) throw new ValidationError('Campo "machine" é obrigatório')

    const before = toNumber(input.before)
    const after = toNumber(input.after)
    const existing = await ctx.interventions.list()
    const seq = 15 + existing.length

    const intervention: Intervention = {
      id: `INT-${String(seq).padStart(3, "0")}`,
      date: input.date ? String(input.date) : formatDateTime(ctx.clock.now()).slice(0, 5),
      machine: String(machine),
      desc: String(input.desc ?? "Intervenção registrada"),
      before,
      after,
      saved: Math.max(0, before - after),
      period: String(input.period ?? "período atual"),
      confidence: String(input.confidence ?? "estimado"),
      status: "active",
      simulated: true,
      estimated: true,
    }

    const saved = await ctx.interventions.save(intervention)
    log.info("Intervencao registrada", { interventionId: saved.id, machine: saved.machine })

    return saved
  }

  /** Modulo Economia: CUSUM, oportunidades e intervencoes registradas. */
  async function economy() {
    const cusum = cusumSeries()
    const list = await interventions()
    const opportunities = await ctx.reports.opportunities()

    return {
      cusum,
      opportunities,
      interventions: list,
      totals: {
        savingsAccumulated: cusum[cusum.length - 1]?.economy ?? 0,
        opportunityMonth: opportunities.reduce((sum, o) => sum + toNumber(o.costMonth), 0),
        activeSavings: list.reduce((sum, i) => sum + toNumber(i.saved), 0),
        tariff: await ctx.config.getTariff(),
      },
    }
  }

  /** Relatorios: series por turno, custo x meta, breakdown e perfil tarifario. */
  async function reports() {
    return {
      shiftData: await ctx.reports.shiftSeries(),
      costTrend: await ctx.reports.costTrend(),
      machineBreakdown: await ctx.reports.machineBreakdown(),
      tariffProfile: await ctx.reports.tariffProfile(),
      tariff: await ctx.config.getTariff(),
    }
  }

  async function opportunities() {
    return ctx.reports.opportunities()
  }

  return { interventions, addIntervention, economy, reports, opportunities, cusumSeries }
}

export type EconomyService = ReturnType<typeof createEconomyService>