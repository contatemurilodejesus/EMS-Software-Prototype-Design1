/**
 * Contexto de aplicacao: da aos services apenas PORTS (nunca tecnologia).
 * Montado uma unica vez no composition root (backend/src/bootstrap/container.ts).
 */

import type {
  Clock,
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
  IUserRepository,
  Logger,
  UnitOfWork,
} from "../domain/ports/index.ts"

export interface ServiceContext {
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
  /** Eventos, relacoes e analises de impacto (secao 11). */
  machineEvents: IMachineEventRepository
  relationships: IRelationshipRepository
  impactAnalyses: IImpactAnalysisRepository
  /** Sessao do usuario autenticado (RBAC, secao 7.4). */
  users: IUserRepository
  invites: IInviteRepository
  refreshTokens: IRefreshTokenRepository
  auditLogs: IAuditLogRepository
  unitOfWork: UnitOfWork
  clock: Clock
  logger: Logger
}