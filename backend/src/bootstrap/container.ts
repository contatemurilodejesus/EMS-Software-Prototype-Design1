/**
 * COMPOSITION ROOT (secao 4): o unico lugar que conhece as implementacoes.
 *
 * Escolhe a persistencia (`EMS_PERSISTENCE=memory|postgres`), monta os
 * repositories, o contexto dos services, a fonte de telemetria, o pipeline de
 * ingestao, o agendador e os application services.
 *
 * Persistencia SEM fallback silencioso (secao 22): `EMS_PERSISTENCE=postgres`
 * exige PostgreSQL acessivel e falha rapida na partida; `EMS_PERSISTENCE=memory`
 * mantem a demonstracao rodando sem Docker.
 */

import { getEnvironment, type Environment } from "../config/environment.ts"
import { createDatabase, type DatabasePort } from "../database/postgres/pool.ts"
import { createLogger, toLoggerPort } from "../infrastructure/logger.ts"
import { createSystemClock } from "../infrastructure/clock.ts"
import { createScheduler, type Scheduler } from "../infrastructure/scheduler.ts"
import { createSimulatorSource } from "../infrastructure/sources/simulator.source.ts"
import { createMqttTelemetrySource } from "../infrastructure/sources/mqtt.source.ts"
import { createIngestionPipeline } from "../ingestion/ingestion.pipeline.ts"
import { createMemoryRepositories, type MemoryRepositories } from "../database/repositories/memory/index.ts"
import { createSeedUsers } from "../database/seeds/seed-data.ts"
import { createPostgresRepositories, type PostgresRepositories } from "../database/postgres/repositories/index.ts"
import {
  createAdminService,
  createAlertService,
  createAuthService,
  createEconomyService,
  createEventService,
  createHealthService,
  createMachineService,
  createOfflineWatchdog,
  createProtocolService,
  createRelationshipService,
  createScenarioService,
  createSecurityService,
  createTelemetryService,
  type ApplicationServices,
  type OfflineWatchdog,
} from "../application/services/index.ts"
import type { IngestionSummary } from "../ingestion/ingestion.pipeline.ts"
import type { ServiceContext } from "../application/context.ts"
import { TENANT_A_ID } from "../database/seeds/seed-data.ts"
import { runWithActor, currentTenantId } from "../shared/tenant-context.ts"
import type { Logger } from "../domain/ports/index.ts"
import { createCompetitionSimulator, type CompetitionSimulator } from "../simulator/competition.ts"
import { DEFAULT_TARIFF } from "../analytics/index.ts"

export interface Container {
  env: Environment
  logger: Logger
  services: ApplicationServices
  scheduler: Scheduler
  watchdog: OfflineWatchdog
  /** Passo de telemetria (usado por POST /api/sim/tick e pelo agendador). */
  ingestStep: () => Promise<IngestionSummary | null>
  startedAt: Date
  ticks: () => number
  lastTickAt: () => Date
  databaseReady: () => Promise<boolean>
  persistence: string
  /** Para agendadores/MQTT e fecha o pool (quando ha). Assincrono de proposito. */
  stop: () => Promise<void>
}

export async function createContainer(
  env: Environment = getEnvironment(),
): Promise<Container> {
  const pinoLogger = createLogger(env)
  const logger = toLoggerPort(pinoLogger, { service: env.serviceName })
  const clock = createSystemClock()
  const startedAt = clock.now()

  // Usuarios do seed: as senhas vem do ambiente e sao HASHEADAS aqui
  // (nenhuma senha real no Git - secao 6.3/15).
  const seedUsers = createSeedUsers({
    adminEmail: env.seedAdminEmail,
    adminPassword: env.seedAdminPassword,
    accountingEmail: env.seedAccountingEmail,
    accountingPassword: env.seedAccountingPassword,
    evaluatorEmail: env.seedEvaluatorEmail,
    evaluatorPassword: env.seedEvaluatorPassword,
    tenantBEmail: env.seedTenantBEmail,
    tenantBPassword: env.seedTenantBPassword,
  })

  let repos: MemoryRepositories | PostgresRepositories;
  let simulator: CompetitionSimulator | undefined;
  let pool: DatabasePort | undefined;

  if (env.persistence === "postgres") {
    const connectionString = process.env.DATABASE_URL ?? env.databaseUrl;
    if (!connectionString) {
      throw new Error("EMS_PERSISTENCE=postgres requer DATABASE_URL (ou conexao no compose).");
    }
    // Sem fallback silencioso: o banco deve estar acessivel antes de subir.
    //
    // resolveTenant lê o tenant do AsyncLocalStorage da requisicao (middleware
    // authenticate chama runWithActor antes de encaminhar). Sem contexto
    // (migrations, seed, jobs) retorna null - a RLS entao aplica o filtro.
    const db = createDatabase({
      connectionString,
      resolveTenant: () => {
        try { return currentTenantId() }
        catch { return null }
      },
    });
    const deadline = Date.now() + (env.databaseConnectTimeoutMs ?? 30_000);
    while (!(await db.healthCheck())) {
      if (Date.now() > deadline) {
        throw new Error(
          `Banco PostgreSQL indisponivel apos 30s (EMS_PERSISTENCE=postgres). Verifique DATABASE_URL.`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    pool = db;
    simulator = createCompetitionSimulator({ tariff: DEFAULT_TARIFF });
    repos = createPostgresRepositories(db, simulator) as PostgresRepositories;
  } else {
    repos = createMemoryRepositories({ live: env.live, version: env.version, seedUsers });
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
    machineEvents: repos.machineEvents,
    relationships: repos.relationships,
    impactAnalyses: repos.impactAnalyses,
    users: repos.users,
    invites: repos.invites,
    refreshTokens: repos.refreshTokens,
    auditLogs: repos.auditLogs,
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

  // Relacoes e eventos ANTES do pipeline: o RECOVERY e registrado na propria
  // ingestao quando a leitura boa reativa uma maquina que o watchdog marcou
  // OFFLINE (secoes 14/15) - o watchdog so cuida do caminho OFFLINE.
  const relationshipService = createRelationshipService(ctx)
  const eventService = createEventService(ctx, {
    relationships: relationshipService,
    impactMinWindowMinutes: env.impactMinWindowMinutes,
  })

  const pipeline = createIngestionPipeline({
    ...ctx,
    alertSink: alertService,
    eventSink: eventService,
  })

  let tickCount = 0
  let lastTick = startedAt

  async function ingestStep(): Promise<IngestionSummary | null> {
    tickCount += 1
    lastTick = clock.now()
    // Job: o passo do simulador roda com o tenant de demonstracao explicito
    // (secao 7.1, item 5) - nunca com o tenant de um request.
    const machines = await runWithActor(
      { tenantId: TENANT_A_ID, userId: "system", role: "ADMIN" },
      () => repos.machines.list({}),
    )
    const readings = source.read(tickCount, machines)
    return runWithActor({ tenantId: TENANT_A_ID, userId: "system", role: "ADMIN" }, () =>
      pipeline.ingest(readings),
    )
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
    pipeline,
  })

  // Fonte MQTT (Fase 4): opt-in por EMS_MQTT_ENABLED e, quando ligada, entrega
  // os payloads ao MESMO pipeline do simulador/HTTP (D19 - sem caminho paralelo).
  const mqttSource = createMqttTelemetrySource({
    config: {
      enabled: env.mqttEnabled,
      url: env.mqttUrl,
      username: env.mqttUsername,
      password: env.mqttPassword,
      topic: env.mqttTopic,
    },
    pipeline,
    gateways: repos.gateways,
    clock,
    logger,
  })
  if (env.mqttEnabled) mqttSource.start()

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
      databaseReady: async () => {
        if (pool) return pool.healthCheck();
        return true;
      },
      persistence: env.persistence,
      /** Estado REAL do client MQTT (Fase 4) - secao 28: nunca "healthy" falso. */
      mqttHealth: () => {
        const s = mqttSource.status()
        if (!s.enabled) {
          return { status: "disabled", note: "EMS_MQTT_ENABLED desligado", broker: s.broker, topic: s.topic }
        }
        if (s.connected) {
          return {
            status: "ok",
            broker: s.broker,
            topic: s.topic,
            lastMessageAt: s.lastMessageAt,
            counters: { ...s.counters },
          }
        }
        return {
          status: "unavailable",
          note: s.lastError ?? "broker desconectado",
          broker: s.broker,
          topic: s.topic,
          lastMessageAt: s.lastMessageAt,
          counters: { ...s.counters },
        }
      },
    },
  )

  const securityService = createSecurityService(ctx)

  const authService = createAuthService(ctx, {
    tenants: repos.tenants,
    inviteTtlHours: env.inviteTtlHours,
    jwtAccessSecret: env.jwtAccessSecret,
    jwtRefreshSecret: env.jwtRefreshSecret,
    accessTtlMinutes: env.jwtAccessTtlMinutes,
    refreshTtlDays: env.jwtRefreshTtlDays,
    onAudit: async (entry) => {
      await securityService.record(entry)
    },
  })

  // relationshipService/eventService: criados antes do pipeline (RECOVERY na
  // ingestao) - ver bloco do composition root acima.

  const watchdog = createOfflineWatchdog(ctx, {
    events: eventService,
    offlineTimeoutMinutes: env.offlineTimeoutMinutes,
    systemActor: { tenantId: TENANT_A_ID, userId: "system", role: "ADMIN" },
  })

  // Watchdog de OFFLINE agendado (docs/backend.md registrava como pendente):
  // varre o tenant do demo a cada 60 s com tenant EXPLICITO (secao 7.1, item 5).
  // O sweep multi-tenant exige contexto privilegiado de banco - proxima etapa.
  const watchdogScheduler = createScheduler({
    intervalMs: 60_000,
    run: () => watchdog.run(TENANT_A_ID),
    onError: (error) => logger.error("watchdog_failed", { error: String(error) }),
  })
  watchdogScheduler.start()

  const services: ApplicationServices = {
    machines: machineService,
    alerts: alertService,
    scenarios: scenarioService,
    economy: economyService,
    protocols: protocolService,
    admin: adminService,
    telemetry: telemetryService,
    health: healthService,
    auth: authService,
    security: securityService,
    events: eventService,
    relationships: relationshipService,
  }

  if (env.live) scheduler.start()

  return {
    env,
    logger,
    services,
    scheduler,
    watchdog,
    ingestStep,
    startedAt,
    ticks: () => tickCount,
    lastTickAt: () => lastTick,
    /** Mesma verificacao do healthService: `SELECT 1` quando ha pool. */
    databaseReady: async () => (pool ? pool.healthCheck() : true),
    persistence: env.persistence,
    /** Para agendadores/MQTT e fecha o pool - usado pelo graceful shutdown. */
    stop: async () => {
      scheduler.stop()
      watchdogScheduler.stop()
      mqttSource.stop()
      // Graceful shutdown: fecha conexoes abertas do pool ANTES do processo
      // morrer. O shutdown handler aguarda esta promise.
      if (pool) {
        try {
          await pool.close()
        } catch (error) {
          logger.error("pool_close_failed", { error: String(error) })
        }
      }
    },
  }
}