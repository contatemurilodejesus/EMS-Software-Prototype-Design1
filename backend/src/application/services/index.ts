/**
 * Barramento dos application services + tipo do contrato de aplicacao.
 */

export * from "./admin.service.ts"
export * from "./alert.service.ts"
export * from "./auth.service.ts"
export * from "./event.service.ts"
export * from "./health.service.ts"
export * from "./machine.service.ts"
export * from "./protocol.service.ts"
export * from "./relationship.service.ts"
export * from "./security.service.ts"
export * from "./telemetry.service.ts"
export {
  createEconomyService,
  cusumSeries,
  type EconomyService,
  type InterventionInput as EconomyInterventionInput,
} from "./economy.service.ts"
export {
  createScenarioService,
  type ScenarioService,
  type ScenarioInput,
  type InterventionInput as ScenarioInterventionInput,
} from "./scenario.service.ts"
export {
  createOfflineWatchdog,
  type OfflineWatchdog,
  type WatchdogDependencies,
} from "./watchdog.service.ts"

import type { AdminService } from "./admin.service.ts"
import type { AlertService } from "./alert.service.ts"
import type { AuthService } from "./auth.service.ts"
import type { EconomyService } from "./economy.service.ts"
import type { EventService } from "./event.service.ts"
import type { HealthService } from "./health.service.ts"
import type { MachineService } from "./machine.service.ts"
import type { ProtocolService } from "./protocol.service.ts"
import type { RelationshipService } from "./relationship.service.ts"
import type { ScenarioService } from "./scenario.service.ts"
import type { SecurityService } from "./security.service.ts"
import type { TelemetryService } from "./telemetry.service.ts"

/** Casos de uso disponiveis para a camada HTTP. */
export interface ApplicationServices {
  machines: MachineService
  alerts: AlertService
  scenarios: ScenarioService
  economy: EconomyService
  protocols: ProtocolService
  admin: AdminService
  telemetry: TelemetryService
  health: HealthService
  /** Autenticacao, usuarios e RBAC (secao 7). */
  auth: AuthService
  security: SecurityService
  /** Eventos, relacoes e analise de impacto (secao 11). */
  events: EventService
  relationships: RelationshipService
}