/**
 * Mapa da API (rotas). Sem regra de negocio, sem SQL: apenas endpoint,
 * metodo, middleware e controller (secao 6 do documento).
 *
 * Compatibilidade: os caminhos e corpos são os MESMOS que o frontend já
 * consome (nenhuma tela precisa ser alterada).
 */

import { Router } from "express"
import { createControllers } from "../controllers/index.ts"
import { validateBody, validateQuery } from "../middleware/index.ts"
import {
  alertAdvanceSchema,
  alertsQuerySchema,
  configPatchSchema,
  economyQuerySchema,
  emptySchema,
  freeBodySchema,
  machineCreateSchema,
  machineQuerySchema,
  machineUpdateSchema,
  protocolAdvanceSchema,
  protocolCreateSchema,
  protocolEventSchema,
  protocolQuerySchema,
  scenarioSchema,
} from "../schemas/index.ts"
import type { ApplicationServices } from "../../application/services/index.ts"

export function createApiRouter(services: ApplicationServices): Router {
  const router = Router()
  const c = createControllers(services)

  /* ---------------- Saude ---------------- */
  router.get("/health", c.health)
  router.get("/health/live", c.live)
  router.get("/health/ready", c.ready)

  /* ---------------- Visao da Fabrica ---------------- */
  router.get("/plants", c.plants)
  router.get("/summary", c.summary)
  router.get("/sectors", c.sectors)
  router.get("/dashboard", c.dashboard)

  /* ---------------- Analytics (motor determinístico do demo) ---------------- */
  router.get("/analytics", c.analytics)
  router.get("/analytics/:key", c.analytics)

  /* ---------------- Intervenções do Competition Mode ---------------- */
  router.get("/interventions", c.listScenarioInterventions)
  router.post("/interventions", validateBody(freeBodySchema), c.createScenarioIntervention)

  /* ---------------- Competition Mode ---------------- */
  router.get("/competition", c.competition)
  router.get("/competition/dashboard", c.competitionDashboard)
  router.get("/competition/analytics", c.competitionAnalytics)
  router.get("/competition/machines", c.competitionMachines)
  router.get("/competition/machines/:id", c.competitionMachine)
  router.get("/competition/machines/:id/telemetry", c.competitionTelemetry)

  /* ---------------- Demo (ativar cenário / reiniciar / passo) ---------------- */
  router.get("/demo/status", c.demoStatus)
  router.post("/demo/scenario", validateBody(scenarioSchema), c.setScenario)
  router.post("/demo/reset", validateBody(emptySchema), c.resetDemo)
  router.post("/demo/step", validateBody(emptySchema), c.stepDemo)

  /* ---------------- Módulo protocolar ---------------- */
  router.get("/protocols", validateQuery(protocolQuerySchema), c.listProtocols)
  router.post("/protocols", validateBody(protocolCreateSchema), c.createProtocol)
  router.get("/protocols/summary", c.protocolsSummary)
  router.get("/protocols/:id", c.getProtocol)
  router.post("/protocols/:id/advance", validateBody(protocolAdvanceSchema), c.advanceProtocol)
  router.post("/protocols/:id/events", validateBody(protocolEventSchema), c.addProtocolEvent)

  /* ---------------- Máquinas ---------------- */
  router.get("/machines", validateQuery(machineQuerySchema), c.listMachines)
  router.post("/machines", validateBody(machineCreateSchema), c.createMachine)
  router.get("/machines/:id", c.getMachine)
  router.patch("/machines/:id", validateBody(machineUpdateSchema), c.updateMachine)
  router.delete("/machines/:id", c.removeMachine)
  router.get("/machines/:id/telemetry", c.machineTelemetry)
  router.get("/machines/:id/analytics", c.machineAnalytics)

  /* ---------------- Alertas ---------------- */
  router.get("/alerts", validateQuery(alertsQuerySchema), c.listAlerts)
  router.get("/alerts/summary", c.alertsSummary)
  router.post("/alerts/:id/advance", validateBody(alertAdvanceSchema), c.advanceAlert)

  /* ---------------- Economia ---------------- */
  router.get("/economy", c.economy)
  router.get("/economy/interventions", validateQuery(economyQuerySchema), c.listEconomyInterventions)
  router.post(
    "/economy/interventions",
    validateBody(freeBodySchema),
    c.createEconomyIntervention,
  )

  /* ---------------- Relatórios ---------------- */
  router.get("/reports", c.reports)

  /* ---------------- Administração ---------------- */
  router.get("/admin", c.adminOverview)
  router.get("/admin/tariffs", c.getTariffs)
  router.patch("/admin/tariffs", validateBody(configPatchSchema), c.patchTariffs)
  router.get("/admin/thresholds", c.getThresholds)
  router.patch("/admin/thresholds", validateBody(configPatchSchema), c.patchThresholds)
  router.post("/admin/shifts/:id/toggle", validateBody(emptySchema), c.toggleShift)

  /* ---------------- Simulação ---------------- */
  router.post("/sim/tick", validateBody(emptySchema), c.simTick)

  return router
}