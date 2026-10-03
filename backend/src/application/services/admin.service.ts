/**
 * Application service - ADMINISTRACAO (cadastro, tarifas, turnos, limiares).
 *
 * A tarifa do seed e uma ESTIMATIVA editavel pelo avaliador; o valor nunca e
 * apresentado como custo real de fabrica.
 */

import { toNumber } from "../../shared/utils/index.ts"
import { NotFoundError, ERROR_CODES } from "../../domain/errors/index.ts"
import type { Machine, Shift, Tariff, Thresholds } from "../../domain/entities/index.ts"
import type { ServiceContext } from "../context.ts"

export interface AdminDependencies {
  machines: () => Promise<Machine[]>
  resetDemo: () => Promise<unknown>
}

export function createAdminService(ctx: ServiceContext, deps: AdminDependencies) {
  const log = ctx.logger.child({ service: "AdminService" })

  /** Cadastro + tarifas + turnos + limiares + saude dos gateways. */
  async function overview() {
    const machines = await deps.machines()

    return {
      machines: machines.map((m) => ({
        id: m.id,
        name: m.name,
        sector: m.sector,
        gateway: m.gateway,
        pOff: m.pOff,
        pRun: m.pRun,
        nominal: m.nominalKW,
      })),
      tariffs: await ctx.config.getTariff(),
      shifts: await ctx.config.listShifts(),
      gatewayHealth: await ctx.config.listGatewayHealth(),
      thresholds: await ctx.config.getThresholds(),
    }
  }

  async function getTariff(): Promise<Tariff> {
    return ctx.config.getTariff()
  }

  async function setTariff(patch: Partial<Tariff>): Promise<Tariff> {
    const tariff = await ctx.config.setTariff(patch)
    log.info("Tarifas atualizadas", { keys: Object.keys(patch) })
    return tariff
  }

  async function getThresholds(): Promise<Thresholds> {
    return ctx.config.getThresholds()
  }

  async function setThresholds(patch: Partial<Thresholds>): Promise<Thresholds> {
    const thresholds = await ctx.config.setThresholds(patch)
    log.info("Limiares atualizados", { keys: Object.keys(patch) })
    return thresholds
  }

  async function listShifts(): Promise<Shift[]> {
    return ctx.config.listShifts()
  }

  async function toggleShift(id: string): Promise<Shift> {
    const shift = await ctx.config.toggleShift(id)
    if (!shift) throw new NotFoundError(`Turno ${id} não encontrado`)
    return shift
  }

  /** Reinicia o demo (cenario NORMAL, passo 0, alertas limpos). */
  async function resetDemo() {
    log.info("Reset do demo solicitado pelo Admin")
    return deps.resetDemo()
  }

  return {
    overview,
    getTariff,
    setTariff,
    getThresholds,
    setThresholds,
    listShifts,
    toggleShift,
    resetDemo,
  }
}

export type AdminService = ReturnType<typeof createAdminService>

/** Converte patch numerico de tarifa/limiares (usado pelos controllers). */
export function numericPatch(input: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(input ?? {})) {
    if (value === undefined || value === null) continue
    out[key] = toNumber(value)
  }
  return out
}

export { ERROR_CODES }