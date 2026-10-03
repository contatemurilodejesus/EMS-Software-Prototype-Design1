/**
 * Contexto de aplicacao: da aos services apenas PORTS (nunca tecnologia).
 * Montado uma unica vez no composition root (backend/src/bootstrap/container.ts).
 */

import type {
  Clock,
  IAlertRepository,
  IConfigRepository,
  IInterventionRepository,
  IMachineRepository,
  IMachineStateRepository,
  IPlantRepository,
  IProtocolRepository,
  IReportRepository,
  IScenarioRepository,
  ITelemetryRepository,
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
  unitOfWork: UnitOfWork
  clock: Clock
  logger: Logger
}