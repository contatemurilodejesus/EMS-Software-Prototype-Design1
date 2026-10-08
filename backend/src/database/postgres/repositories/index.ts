/**
 * Repositories PostgreSQL - fabrica unificada.
 *
 * Cada factory recebe o `DatabasePort` (o pool configurado com o papel
 * `energymatrix_app` e o tenant aplicado por setTenant/AsyncLocalStorage da
 * requisicao) e, opcionalmente, o simulador Competition Mode. O container
 * escolhe este factory quando `EMS_PERSISTENCE=postgres`.
 */

import type {
  IAlertRepository,
  IAuditLogRepository,
  IConfigRepository,
  IGatewayRepository,
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
} from "../../../domain/ports/index.ts";
import type { CompetitionSimulator } from "../../../simulator/competition.ts";
import type { DatabasePort } from "../pool.ts";
import {
  createPostgresAlertRepository,
  createPostgresInterventionRepository,
} from "./alert.repository.ts";
import {
  createPostgresAuditLogRepository,
  createPostgresReportRepository,
} from "./report.repository.ts";
import {
  createPostgresConfigRepository,
  createPostgresPlantRepository,
} from "./config.repository.ts";
import { createPostgresGatewayRepository } from "./gateway.repository.ts";
import {
  createPostgresImpactAnalysisRepository,
  createPostgresMachineEventRepository,
  createPostgresRelationshipRepository,
} from "./graph.repository.ts";
import {
  createPostgresMachineRepository,
  createPostgresMachineStateRepository,
  createPostgresTelemetryRepository,
} from "./machine.repository.ts";
import {
  createPostgresProtocolRepository,
} from "./protocol.repository.ts";
import {
  createPostgresScenarioRepository,
} from "./scenario.repository.ts";
import {
  createPostgresTenantRepository,
  createPostgresUserRepository,
  createPostgresInviteRepository,
  createPostgresRefreshTokenRepository,
} from "../identity.repository.ts";

export interface PostgresRepositories {
  machines: IMachineRepository;
  machineStates: IMachineStateRepository;
  telemetry: ITelemetryRepository;
  alerts: IAlertRepository;
  interventions: IInterventionRepository;
  protocols: IProtocolRepository;
  config: IConfigRepository;
  plants: IPlantRepository;
  reports: IReportRepository;
  scenarios: IScenarioRepository;
  machineEvents: IMachineEventRepository;
  relationships: IRelationshipRepository;
  impactAnalyses: IImpactAnalysisRepository;
  tenants: ITenantRepository;
  users: IUserRepository;
  invites: IInviteRepository;
  refreshTokens: IRefreshTokenRepository;
  auditLogs: IAuditLogRepository;
  gateways: IGatewayRepository;
  unitOfWork: UnitOfWork;
}

/** `UnitOfWork` em PostgreSQL: transacao real com BEGIN/COMMIT/ROLLBACK. */
export function createPostgresRepositories(
  db: DatabasePort,
  simulator?: CompetitionSimulator,
): PostgresRepositories {
  const unitOfWork: UnitOfWork = {
    transaction: async <T>(run: () => Promise<T>): Promise<T> => db.transaction(() => run()),
  };

  return {
    machines: createPostgresMachineRepository(db),
    machineStates: createPostgresMachineStateRepository(db),
    telemetry: createPostgresTelemetryRepository(db),
    alerts: createPostgresAlertRepository(db),
    interventions: createPostgresInterventionRepository(db),
    protocols: createPostgresProtocolRepository(db),
    config: createPostgresConfigRepository(db),
    plants: createPostgresPlantRepository(db),
    reports: createPostgresReportRepository(db),
    scenarios: createPostgresScenarioRepository(db, simulator!),
    machineEvents: createPostgresMachineEventRepository(db),
    relationships: createPostgresRelationshipRepository(db),
    impactAnalyses: createPostgresImpactAnalysisRepository(db),
    tenants: createPostgresTenantRepository(db),
    users: createPostgresUserRepository(db),
    invites: createPostgresInviteRepository(db),
    refreshTokens: createPostgresRefreshTokenRepository(db),
    auditLogs: createPostgresAuditLogRepository(db),
    gateways: createPostgresGatewayRepository(db),
    unitOfWork,
  };
}
