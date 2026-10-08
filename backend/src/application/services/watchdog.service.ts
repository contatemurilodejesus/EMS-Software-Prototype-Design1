/**
 * Service de aplicacao - WATCHDOG DE OFFLINE (secao 11.1 / D9).
 *
 * Varre as maquinas do tenant periodicamente: quando nao ha telemetria nao-
 * MISSING ha mais de P2 minutos, registra o evento OFFLINE e abre o alerta.
 * Quando a leitura volta, registra RECOVERY. Roda com `Clock` injetado e
 * `runWithActor` explicito (jobs tem tenant proprio - secao 7.1, item 5).
 */

import { formatDateTime } from "../../shared/utils/index.ts"
import { currentTenantId, runWithActor, type ActorContext } from "../../shared/tenant-context.ts"
import type { MachineRecord } from "../../domain/entities/index.ts"
import type { ServiceContext } from "../context.ts"
import type { EventService } from "./event.service.ts"

export interface WatchdogDependencies {
  events: EventService
  /** P2: minutos de ausencia antes de OFFLINE (vem do ambiente). */
  offlineTimeoutMinutes: number
  /** Identidade usada pelos jobs (fora de requisicao). */
  systemActor: ActorContext
}

export interface WatchdogResult {
  checked: number
  offline: string[]
  recovered: string[]
}

export function createOfflineWatchdog(ctx: ServiceContext, deps: WatchdogDependencies) {
  const log = ctx.logger.child({ service: "OfflineWatchdog" })

  /** Minutos desde a ultima telemetria utilizavel (GOOD/OUTLIER). */
  function silentMinutes(machine: MachineRecord, now: Date): number {
    if (!machine.lastMessageAt) return Number.POSITIVE_INFINITY
    const last = new Date(machine.lastMessageAt).getTime()
    if (Number.isNaN(last)) return Number.POSITIVE_INFINITY
    return (now.getTime() - last) / 60000
  }

  async function run(tenantId?: string): Promise<WatchdogResult> {
    const tenant = tenantId ?? currentTenantId()
    const now = ctx.clock.now()

    const result: WatchdogResult = { checked: 0, offline: [], recovered: [] }

    // Job: executa com o tenant explicito, nunca com o do request.
    return runWithActor({ ...deps.systemActor, tenantId: tenant }, async () => {
      const machines = await ctx.machines.list({})

      for (const machine of machines) {
        result.checked += 1
        const minutes = silentMinutes(machine, now)
        const wasOffline = machine.online === false

        // `Infinity` = nunca reportou (lastMessageAt nulo): sem telemetria
        // nenhuma e justamente OFFLINE - o `continue` anterior escondia esse
        // caso (maquina nova nunca era sinalizada).
        if (minutes > deps.offlineTimeoutMinutes && !wasOffline) {
          await ctx.machines.update(machine.id, { online: false, quality: "MISSING" })
          await deps.events.record({
            machineId: machine.id,
            type: "OFFLINE",
            severity: "WARNING",
            metadata: {
              silentMinutes: Number.isFinite(minutes) ? Number(minutes.toFixed(1)) : null,
              neverReported: !Number.isFinite(minutes),
              thresholdMinutes: deps.offlineTimeoutMinutes,
              at: formatDateTime(now),
            },
          })
          result.offline.push(machine.id)
          log.warn("Maquina OFFLINE por ausencia de telemetria", {
            machineId: machine.id,
            silentMinutes: Number(minutes.toFixed(1)),
          })
        } else if (minutes <= deps.offlineTimeoutMinutes && wasOffline) {
          await ctx.machines.update(machine.id, { online: true })
          await deps.events.record({
            machineId: machine.id,
            type: "RECOVERY",
            severity: "INFO",
            metadata: { silentMinutes: Number(minutes.toFixed(1)), at: formatDateTime(now) },
          })
          result.recovered.push(machine.id)
          log.info("Maquina voltou a reportar telemetria", { machineId: machine.id })
        }
      }

      return result
    })
  }

  return { run }
}

export type OfflineWatchdog = ReturnType<typeof createOfflineWatchdog>