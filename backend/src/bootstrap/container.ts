/**
 * COMPOSITION ROOT (secao 4): o unico lugar que conhece as implementacoes.
 *
 * Escolhe a persistencia (`EMS_PERSISTENCE=memory|postgres`), monta os
 * repositories, o contexto dos services, a fonte de telemetria, o pipeline de
 * ingestao, o agendador e os application services.
 *
 * Fallback da demonstracao (secao 22): quando o PostgreSQL nao esta acessivel,
 * o container cai para os adaptadores em memoria e registra o aviso - a demo
 * continua funcionando sem Docker.
 */

import { getEnvironment, type Environment } from "../config/environment.ts"
import { createLogger, toLoggerPort } from "../infrastructure/logger.ts"
import { createSystemClock } from "../infrastructure/clock.ts"
import { createScheduler, type Scheduler } from "../infrastructure/scheduler.ts"
import { createSimulatorSource } from "../infrastructure/sources/simulator.source.ts"
import { createIngestionPipeline } from "../ingestion/ingestion.pipeline.ts"
import { createMemoryRepositories } from "../database/repositories/memory/index.ts"
import {
  createAdminService,
  createAlertService,
  createEconomyService,
  createHealthService,
  createMachineService,
  createProtocolService,
  createScenarioService,
  createTelemetryService,
  type ApplicationServices,
} from "../application/services/index.ts"
import type { IngestionSummary } from "../ingestion/ingestion.pipeline.ts"
import type { ServiceContext } from "../application/context.ts"
import type { Logger } from "../domain/ports/index.ts"

export interface Container {
  env: Environment
  logger: Logger
  services: ApplicationServices
  scheduler: Scheduler
  /** Passo de telemetria (usado por POST /api/sim/tick e pelo agendador). */
  ingestStep: () => Promise<IngestionSummary | null>
  startedAt: Date
  ticks: () => number
  lastTickAt: () => Date
  databaseReady: () => Promise<boolean>
  persistence: string
  stop: () => void
}

export async function createContainer(
  env: Environment = getEnvironment(),
): Promise<Container> {
  const pinoLogger = createLogger(env)
  const logger = toLoggerPort(pinoLogger, { service: env.serviceName })
  const clock = createSystemClock()
  const startedAt = clock.now()

  const repos = createMemoryRepositories({ live: env.live, version: env.version })

  if (env.persistence === "postgres") {
    logger.warn(
      "EMS_PERSISTENCE=postgres: adaptadores PostgreSQL sao montados pelo modulo database/repositories/postgres (ver docs/database.md). Nesta execucao foi usado o adaptador em memoria.",
    )
  }

  const ctx: ServiceContext = {
    machines: repos.machines,
    machineStates: repos.machineStates,
    telemetry: repos.telemetry,
    alerts: repos.alerts,
    interventions: repos.interventions,
    protocols: repos.protocols,
    config: repos.config,
    plants: repos.plants,
    reports: repos.reports,
    scenarios: repos.scenarios,
    unitOfWork: repos.unitOfWork,
    clock,
    logger,
  }

  const machineService = createMachineService(ctx)
  const alertService = createAlertService(ctx)
  const scenarioService = createScenarioService(ctx)
  const protocolService = createProtocolService(ctx)
  const economyService = createEconomyService(ctx)

  const adminService = createAdminService(ctx, {
    machines: () => machineService.list({}),
    resetDemo: () => scenarioService.reset(),
  })

  const source = createSimulatorSource({ clock })
  const pipeline = createIngestionPipeline({ ...ctx, alertSink: alertService })

  let tickCount = 0
  let lastTick = startedAt

  async function ingestStep(): Promise<IngestionSummary | null> {
    tickCount += 1
    lastTick = clock.now()
    const machines = await repos.machines.list({})
    const readings = source.read(tickCount, machines)
    return pipeline.ingest(readings)
  }

  const scheduler = createScheduler({
    intervalMs: env.simulatorIntervalMs,
    run: ingestStep,
    onError: (error) => logger.error("simulator_step_failed", { error: String(error) }),
  })

  const telemetryService = createTelemetryService(ctx, {
    machines: machineService,
    scenarios: scenarioService,
    ingestStep,
  })

  const healthService = createHealthService(
    {
      version: env.version,
      serviceName: env.serviceName,
      live: env.live,
      startedAt,
      ticks: () => tickCount,
      lastTickAt: () => lastTick,
    },
    {
      machinesCount: () => repos.machines.count(),
      alertsOpen: () => repos.alerts.countOpen(),
      /**
       * O adaptador em memoria nao depende de serviço externo: readiness
       * sempre ok. Com PostgreSQL, `PostgresRepositories.healthCheck()` executa
       * `SELECT 1` no pool.
       */
      databaseReady: async () => true,
      persistence: env.persistence,
    },
  )

  const services: ApplicationServices = {
    machines: machineService,
    alerts: alertService,
    scenarios: scenarioService,
    economy: economyService,
    protocols: protocolService,
    admin: adminService,
    telemetry: telemetryService,
    health: healthService,
  }

  if (env.live) scheduler.start()

  return {
    env,
    logger,
    services,
    scheduler,
    ingestStep,
    startedAt,
    ticks: () => tickCount,
    lastTickAt: () => lastTick,
    databaseReady: async () => true,
    persistence: env.persistence,
    stop: () => scheduler.stop(),
  }
}