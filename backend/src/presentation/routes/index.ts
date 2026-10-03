/**
 * Mapa da API (rotas). Sem regra de negocio, sem SQL: apenas endpoint,
 * metodo, middleware e controller (secao 6 do documento).
 *
 * Compatibilidade: os caminhos e corpos são os MESMOS que o frontend já
 * consome (nenhuma tela precisa ser alterada).
 */

import { Router } from "express"
import { createControllers } from "../controllers/index.ts"
import { authenticate, rateLimit, requireRole, validateBody, validateQuery } from "../middleware/index.ts"
import {
  alertAdvanceSchema,
  alertsQuerySchema,
  configPatchSchema,
  economyQuerySchema,
  emptySchema,
  eventQuerySchema,
  freeBodySchema,
  impactAnalyzeSchema,
  impactQuerySchema,
  inviteAcceptSchema,
  inviteCreateSchema,
  loginSchema,
  logoutSchema,
  machineCreateSchema,
  machineQuerySchema,
  machineUpdateSchema,
  passwordChangeSchema,
  protocolAdvanceSchema,
  protocolCreateSchema,
  protocolEventSchema,
  protocolQuerySchema,
  refreshSchema,
  relationshipCreateSchema,
  relationshipUpdateSchema,
  scenarioSchema,
} from "../schemas/index.ts"
import type { ApplicationServices } from "../../application/services/index.ts"

/**
 * Mapa da API.
 *
 * Rotas PUBLICAS: health e `/api/auth/*` (login, refresh, logout, convite).
 * Todo o restante exige access token (`authenticate`) e o `tenantId` vem das
 * claims - nunca do body/query/header (secao 7.1).
 */
export function createApiRouter(services: ApplicationServices): Router {
  const router = Router()
  const c = createControllers(services)

  /* ---------------- Saude (publica) ---------------- */
  router.get("/health", c.health)
  router.get("/health/live", c.live)
  router.get("/health/ready", c.ready)

  /* ---------------- Autenticacao (publica, com rate limiting) ---------------- */
  const loginLimiter = rateLimit({
    windowMs: 60_000,
    max: 10,
    message: "Muitas tentativas de login. Aguarde um minuto.",
  })

  router.post("/auth/login", loginLimiter, validateBody(loginSchema), c.login)
  router.post("/auth/refresh", validateBody(refreshSchema), c.refresh)
  router.post("/auth/logout", validateBody(logoutSchema), c.logout)
  router.post("/auth/invites/accept", loginLimiter, validateBody(inviteAcceptSchema), c.acceptInvite)

  /* ---------------- A partir daqui: autenticado ---------------- */
  const auth = authenticate(services.auth)
  const admin = requireRole("ADMIN")
  const evaluator = requireRole("ADMIN", "MACHINE_EVALUATOR")
  const finance = requireRole("ADMIN", "ACCOUNTING")

  router.use(auth)

  router.get("/auth/me", c.me)
  router.post("/auth/password", validateBody(passwordChangeSchema), c.changePassword)

  /* ---------------- Usuarios, convites e seguranca (ADMIN) ---------------- */
  router.get("/users", admin, c.listUsers)
  router.get("/security", admin, c.securityOverview)
  router.get("/security/audit-logs", admin, c.listAuditLogs)
  router.patch("/users/:id/role", admin, c.setUserRole)
  router.patch("/users/:id/status", admin, c.setUserStatus)
  router.get("/invites", admin, c.listInvites)
  router.post("/invites", admin, validateBody(inviteCreateSchema), c.createInvite)

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
  router.get("/machines/network", c.machineNetwork)
  router.get("/machines/:id", c.getMachine)
  router.patch("/machines/:id", validateBody(machineUpdateSchema), c.updateMachine)
  router.delete("/machines/:id", c.removeMachine)
  router.get("/machines/:id/telemetry", c.machineTelemetry)
  router.get("/machines/:id/analytics", c.machineAnalytics)
  router.get("/machines/:id/context", c.machineContext)
  router.get("/machines/:id/events", validateQuery(eventQuerySchema), c.listEvents)
  router.get("/machines/:id/impacts", validateQuery(impactQuerySchema), c.listImpacts)

  /* ---------------- Relações entre máquinas (D1) ---------------- */
  router.get("/relationships", c.listRelationships)
  router.post("/relationships", evaluator, validateBody(relationshipCreateSchema), c.createRelationship)
  router.patch("/relationships/:id", evaluator, validateBody(relationshipUpdateSchema), c.updateRelationship)
  router.delete("/relationships/:id", evaluator, c.deleteRelationship)

  /* ---------------- Eventos e análise de impacto (11.1 e 11.3) ---------------- */
  router.get("/events", validateQuery(eventQuerySchema), c.listEvents)
  router.get("/impacts", validateQuery(impactQuerySchema), c.listImpacts)
  router.get("/impacts/:id", c.getImpact)
  router.post("/impacts/analyze", evaluator, validateBody(impactAnalyzeSchema), c.analyzeImpact)

  /* ---------------- Alertas ---------------- */
  router.get("/alerts", validateQuery(alertsQuerySchema), c.listAlerts)
  router.get("/alerts/summary", c.alertsSummary)
  router.post("/alerts/:id/advance", validateBody(alertAdvanceSchema), c.advanceAlert)

  /* ---------------- Economia ---------------- */
  router.get("/economy", finance, c.economy)
  router.get("/economy/interventions", finance, validateQuery(economyQuerySchema), c.listEconomyInterventions)
  router.post(
    "/economy/interventions",
    finance,
    validateBody(freeBodySchema),
    c.createEconomyIntervention,
  )

  /* ---------------- Relatórios ---------------- */
  router.get("/reports", c.reports)

  /* ---------------- Administração ---------------- */
  router.get("/admin", admin, c.adminOverview)
  router.get("/admin/tariffs", admin, c.getTariffs)
  router.patch("/admin/tariffs", admin, validateBody(configPatchSchema), c.patchTariffs)
  router.get("/admin/thresholds", admin, c.getThresholds)
  router.patch("/admin/thresholds", admin, validateBody(configPatchSchema), c.patchThresholds)
  router.post("/admin/shifts/:id/toggle", admin, validateBody(emptySchema), c.toggleShift)

  /* ---------------- Telemetria persistente (D4: JWT + mesmo pipeline) ---------------- */
  router.post("/telemetry", admin, c.ingestTelemetry)

  /* ---------------- Simulação ---------------- */
  router.post("/sim/tick", validateBody(emptySchema), c.simTick)

  return router
}