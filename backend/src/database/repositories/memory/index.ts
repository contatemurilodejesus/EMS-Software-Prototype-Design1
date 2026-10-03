/**
 * Repositories EM MEMORIA - fabrica (composition root do modo `memory`).
 *
 * Escolhido por `EMS_PERSISTENCE=memory` (padrao do prototipo/demonstracao).
 * Nenhuma regra de negocio aqui: apenas liga os ports aos adaptadores.
 */

import type {
  IAlertRepository,
  IAuditLogRepository,
  IConfigRepository,
  IImpactAnalysisRepository,
  IInterventionRepository,
  IInviteRepository,
  IMachineEventRepository,
  IMachineRepository,
  IMachineStateRepository,
  IPlantRepository,
  IProtocolRepository,
  IRefreshTokenRepository,
  IRelationshipRepository,
  IReportRepository,
  IScenarioRepository,
  ITelemetryRepository,
  ITenantRepository,
  IUserRepository,
  UnitOfWork,
} from "../../../domain/ports/index.ts"
import { createMemoryAlertRepository, createMemoryInterventionRepository } from "./alert.repository.ts"
import {
  createMemoryAuditLogRepository,
  createMemoryInviteRepository,
  createMemoryRefreshTokenRepository,
  createMemoryTenantRepository,
  createMemoryUserRepository,
} from "./auth.repository.ts"
import { createMemoryConfigRepository, createMemoryPlantRepository } from "./config.repository.ts"
import {
  createMemoryImpactAnalysisRepository,
  createMemoryMachineEventRepository,
  createMemoryRelationshipRepository,
} from "./graph.repository.ts"
import { createMemoryMachineStateRepository } from "./machine-state.repository.ts"
import {
  createMemoryMachineRepository,
  createMemoryTelemetryRepository,
} from "./machine.repository.ts"
import { createMemoryProtocolRepository } from "./protocol.repository.ts"
import { createMemoryReportRepository } from "./report.repository.ts"
import { createMemoryScenarioRepository } from "./scenario.repository.ts"
import { createMemoryState, type CreateMemoryStateOptions, type MemoryStore } from "./memory-state.ts"

export interface MemoryRepositories {
  store: MemoryStore
  machines: IMachineRepository
  machineStates: IMachineStateRepository
  telemetry: ITelemetryRepository
  alerts: IAlertRepository
  interventions: IInterventionRepository
  protocols: IProtocolRepository
  config: IConfigRepository
  plants: IPlantRepository
  reports: IReportRepository
  scenarios: IScenarioRepository
  /** Multi-tenancy e autenticacao (secao 7). */
  tenants: ITenantRepository
  users: IUserRepository
  invites: IInviteRepository
  refreshTokens: IRefreshTokenRepository
  auditLogs: IAuditLogRepository
  /** Eventos, relacoes e impacto (secao 11). */
  machineEvents: IMachineEventRepository
  relationships: IRelationshipRepository
  impactAnalyses: IImpactAnalysisRepository
  unitOfWork: UnitOfWork
}

export function createMemoryRepositories(options: CreateMemoryStateOptions = {}): MemoryRepositories {
  const store = createMemoryState(options)

  return {
    store,
    machines: createMemoryMachineRepository(store),
    machineStates: createMemoryMachineStateRepository(store),
    telemetry: createMemoryTelemetryRepository(store),
    alerts: createMemoryAlertRepository(store),
    interventions: createMemoryInterventionRepository(store),
    protocols: createMemoryProtocolRepository(store),
    config: createMemoryConfigRepository(store),
    plants: createMemoryPlantRepository(store),
    reports: createMemoryReportRepository(store),
    scenarios: createMemoryScenarioRepository(store),
    tenants: createMemoryTenantRepository(store),
    users: createMemoryUserRepository(store),
    invites: createMemoryInviteRepository(store),
    refreshTokens: createMemoryRefreshTokenRepository(store),
    auditLogs: createMemoryAuditLogRepository(store),
    machineEvents: createMemoryMachineEventRepository(store),
    relationships: createMemoryRelationshipRepository(store),
    impactAnalyses: createMemoryImpactAnalysisRepository(store),
    /**
     * Adaptador em memoria nao possui transacao real. A unidade de trabalho
     * existe para que os services nao dependam de `pg`: no modo PostgreSQL ela
     * abre BEGIN/COMMIT/ROLLBACK. Em caso de erro, nada e confirmado
     * (limitacao documentada em docs/backend.md).
     */
    unitOfWork: {
      transaction: async <T>(run: () => Promise<T>): Promise<T> => run(),
    },
  }
}