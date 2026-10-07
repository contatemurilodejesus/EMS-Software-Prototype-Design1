/**
 * Controllers - camada HTTP fina.
 *
 * Regras: validar entrada (via schemas), chamar UM caso de uso, converter o
 * resultado em HTTP. Nada de SQL, nada de regra de negocio, nada de analytics.
 */

import type { Response } from "express"
import { asyncHandler } from "../middleware/index.ts"
import { numericPatch } from "../../application/services/index.ts"
import { ERROR_CODES, NotFoundError } from "../../domain/errors/index.ts"
import type { ApplicationServices } from "../../application/services/index.ts"
import type { AdvanceInput, EventInput, ProtocolInput } from "../../application/services/protocol.service.ts"
import type { InterventionInput as ScenarioInterventionInput } from "../../application/services/scenario.service.ts"
import type { InterventionInput as EconomyInterventionInput } from "../../application/services/economy.service.ts"
import type { MachineInput } from "../../application/services/machine.service.ts"
import type { Tariff, Thresholds } from "../../domain/entities/index.ts"

/** Listas devolvem array (contrato atual) + metadados no header. */
function sendList(res: Response, items: unknown[]): void {
  res.setHeader("X-Total-Count", String(items.length))
  res.json(items)
}

export function createControllers(services: ApplicationServices) {
  /* ---------------- Saude ---------------- */

  const health = asyncHandler(async (_req, res) => {
    res.json(await services.health.health())
  })

  const live = asyncHandler(async (_req, res) => {
    res.json(services.health.live())
  })

  const database = asyncHandler(async (_req, res) => {
    res.json(await services.health.database())
  })

  const mqtt = asyncHandler(async (_req, res) => {
    res.json(await services.health.mqtt())
  })

  const ready = asyncHandler(async (_req, res) => {
    const body = await services.health.ready()
    res.status(body.status === "ready" ? 200 : 503).json(body)
  })

  /* ---------------- Visao da Fabrica ---------------- */

  const summary = asyncHandler(async (_req, res) => {
    res.json(await services.machines.summary())
  })

  const sectors = asyncHandler(async (_req, res) => {
    sendList(res, await services.machines.sectors())
  })

  const plants = asyncHandler(async (_req, res) => {
    sendList(res, await services.machines.listPlants())
  })

  /* ---------------- Dashboard / Analytics ---------------- */

  const dashboard = asyncHandler(async (_req, res) => {
    res.json(await services.scenarios.dashboard())
  })

  const analytics = asyncHandler(async (req, res) => {
    res.json(await services.scenarios.analytics(req.params.key))
  })

  const reports = asyncHandler(async (_req, res) => {
    res.json(await services.economy.reports())
  })

  /* ---------------- Maquinas ---------------- */

  const listMachines = asyncHandler(async (req, res) => {
    const query = req.query as { state?: string; sector?: string }
    sendList(res, await services.machines.list({ state: query.state, sector: query.sector }))
  })

  const createMachine = asyncHandler(async (req, res) => {
    const machine = await services.machines.create(req.body as MachineInput)
    res.status(201).json(machine)
  })

  const getMachine = asyncHandler(async (req, res) => {
    const machine = await services.machines.findById(req.params.id)
    if (!machine) {
      throw new NotFoundError(
        `Máquina ${req.params.id} não encontrada`,
        ERROR_CODES.MACHINE_NOT_FOUND,
      )
    }
    res.json({ ...machine, loadCurve: services.machines.loadCurve(machine) })
  })

  const updateMachine = asyncHandler(async (req, res) => {
    res.json(await services.machines.update(req.params.id, req.body as MachineInput))
  })

  const removeMachine = asyncHandler(async (req, res) => {
    await services.machines.remove(req.params.id)
    res.status(204).end()
  })

  const machineTelemetry = asyncHandler(async (req, res) => {
    res.json(await services.telemetry.machineTelemetry(req.params.id))
  })

  const machineAnalytics = asyncHandler(async (req, res) => {
    res.json(await services.telemetry.machineAnalytics(req.params.id))
  })

  /* ---------------- Alertas ---------------- */

  const listAlerts = asyncHandler(async (req, res) => {
    const query = req.query as { severity?: string; status?: string }
    sendList(res, await services.alerts.list({ severity: query.severity, status: query.status }))
  })

  const alertsSummary = asyncHandler(async (_req, res) => {
    res.json(await services.alerts.summary())
  })

  const advanceAlert = asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { assignee?: string }
    res.json(await services.alerts.advance(req.params.id, { assignee: body.assignee }))
  })

  /* ---------------- Economia ---------------- */

  const economy = asyncHandler(async (_req, res) => {
    res.json(await services.economy.economy())
  })

  const listEconomyInterventions = asyncHandler(async (_req, res) => {
    sendList(res, await services.economy.interventions())
  })

  const createEconomyIntervention = asyncHandler(async (req, res) => {
    const created = await services.economy.addIntervention(req.body as EconomyInterventionInput)
    res.status(201).json(created)
  })

  /* ---------------- Intervencoes do Competition Mode ---------------- */

  const listScenarioInterventions = asyncHandler(async (_req, res) => {
    const snapshot = await services.scenarios.competition()
    sendList(res, snapshot.interventions)
  })

  const createScenarioIntervention = asyncHandler(async (req, res) => {
    const created = await services.scenarios.addIntervention(
      req.body as ScenarioInterventionInput,
    )
    res.status(201).json(created)
  })

  /* ---------------- Competition Mode / Demo ---------------- */

  const competition = asyncHandler(async (_req, res) => {
    res.json(await services.scenarios.competition())
  })

  const competitionDashboard = asyncHandler(async (_req, res) => {
    res.json(await services.scenarios.dashboard())
  })

  const competitionAnalytics = asyncHandler(async (_req, res) => {
    res.json(await services.scenarios.analytics())
  })

  const competitionMachines = asyncHandler(async (_req, res) => {
    sendList(res, await services.scenarios.machines())
  })

  const competitionMachine = asyncHandler(async (req, res) => {
    res.json(await services.scenarios.machine(req.params.id))
  })

  const competitionTelemetry = asyncHandler(async (req, res) => {
    res.json(await services.scenarios.telemetry(req.params.id))
  })

  const demoStatus = asyncHandler(async (_req, res) => {
    res.json(await services.scenarios.status())
  })

  const setScenario = asyncHandler(async (req, res) => {
    res.json(await services.scenarios.setScenario(req.body as { scenario?: unknown }))
  })

  const resetDemo = asyncHandler(async (_req, res) => {
    res.json(await services.scenarios.reset())
  })

  const stepDemo = asyncHandler(async (_req, res) => {
    res.json(await services.scenarios.step())
  })

  /* ---------------- Modulo protocolar ---------------- */

  const listProtocols = asyncHandler(async (req, res) => {
    const query = req.query as { status?: string; priority?: string; sla?: string }
    sendList(res, await services.protocols.list(query))
  })

  const protocolsSummary = asyncHandler(async (_req, res) => {
    res.json(await services.protocols.summary())
  })

  const createProtocol = asyncHandler(async (req, res) => {
    const created = await services.protocols.create(req.body as ProtocolInput)
    res.status(201).json(created)
  })

  const getProtocol = asyncHandler(async (req, res) => {
    res.json(await services.protocols.findById(req.params.id))
  })

  const advanceProtocol = asyncHandler(async (req, res) => {
    res.json(await services.protocols.advance(req.params.id, (req.body ?? {}) as AdvanceInput))
  })

  const addProtocolEvent = asyncHandler(async (req, res) => {
    res.json(await services.protocols.addEvent(req.params.id, (req.body ?? {}) as EventInput))
  })

  /* ---------------- Administracao ---------------- */

  const adminOverview = asyncHandler(async (_req, res) => {
    res.json(await services.admin.overview())
  })

  const getTariffs = asyncHandler(async (_req, res) => {
    res.json(await services.admin.getTariff())
  })

  const patchTariffs = asyncHandler(async (req, res) => {
    const patch = numericPatch(req.body as Record<string, unknown>) as Partial<Tariff>
    res.json(await services.admin.setTariff(patch))
  })

  const getThresholds = asyncHandler(async (_req, res) => {
    res.json(await services.admin.getThresholds())
  })

  const patchThresholds = asyncHandler(async (req, res) => {
    const patch = numericPatch(req.body as Record<string, unknown>) as Partial<Thresholds>
    res.json(await services.admin.setThresholds(patch))
  })

  const toggleShift = asyncHandler(async (req, res) => {
    res.json(await services.admin.toggleShift(req.params.id))
  })

  /* ---------------- Simulacao ---------------- */

  const simTick = asyncHandler(async (_req, res) => {
    await services.telemetry.tick()
    res.json(await services.health.health())
  })

  /* ---------------- Autenticacao (secao 7.3) ---------------- */

  const login = asyncHandler(async (req, res) => {
    res.json(await services.auth.login(req.body as { email: string; password: string }))
  })

  const refresh = asyncHandler(async (req, res) => {
    res.json(await services.auth.refresh(String(req.body.refreshToken ?? "")))
  })

  const logout = asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { refreshToken?: string }
    res.json(await services.auth.logout(body.refreshToken))
  })

  const me = asyncHandler(async (_req, res) => {
    res.json(await services.auth.me())
  })

  const changePassword = asyncHandler(async (req, res) => {
    res.json(
      await services.auth.changePassword(req.body as { currentPassword: string; newPassword: string }),
    )
  })

  const createInvite = asyncHandler(async (req, res) => {
    const created = await services.auth.createInvite(req.body as { email: string; role: string })
    res.status(201).json(created)
  })

  const listInvites = asyncHandler(async (_req, res) => {
    sendList(res, await services.auth.listInvites())
  })

  const acceptInvite = asyncHandler(async (req, res) => {
    const body = req.body as { code: string; name: string; password: string }
    res.status(201).json(await services.auth.acceptInvite(body))
  })

  const listUsers = asyncHandler(async (_req, res) => {
    sendList(res, await services.auth.listUsers())
  })

  /* ---------------- Usuarios e seguranca (RBAC) ---------------- */

  const securityOverview = asyncHandler(async (_req, res) => {
    res.json(await services.security.overview())
  })

  const listAuditLogs = asyncHandler(async (_req, res) => {
    sendList(res, await services.security.auditLogs())
  })

  const setUserRole = asyncHandler(async (req, res) => {
    res.json(await services.security.setUserRole(req.params.id, String(req.body.role ?? "")))
  })

  const setUserStatus = asyncHandler(async (req, res) => {
    res.json(await services.security.setUserStatus(req.params.id, String(req.body.status ?? "")))
  })

  /* ---------------- Relacoes entre maquinas (secao 11.2) ---------------- */

  const listRelationships = asyncHandler(async (_req, res) => {
    sendList(res, await services.relationships.list())
  })

  const createRelationship = asyncHandler(async (req, res) => {
    res.status(201).json(await services.relationships.create(req.body))
  })

  const updateRelationship = asyncHandler(async (req, res) => {
    res.json(await services.relationships.update(req.params.id, req.body))
  })

  const deleteRelationship = asyncHandler(async (req, res) => {
    await services.relationships.remove(req.params.id)
    res.status(204).end()
  })

  const machineNetwork = asyncHandler(async (_req, res) => {
    res.json(await services.relationships.network())
  })

  const machineContext = asyncHandler(async (req, res) => {
    res.json(await services.relationships.machineContext(req.params.id))
  })

  /* ---------------- Eventos e analise de impacto (secoes 11.1 e 11.3) ---------------- */

  const listEvents = asyncHandler(async (req, res) => {
    const query = req.query as { machineId?: string; type?: string; severity?: string; limit?: number }
    sendList(res, await services.events.list(query))
  })

  const listImpacts = asyncHandler(async (req, res) => {
    const query = req.query as { machineId?: string; limit?: number }
    sendList(res, await services.events.listImpacts(query))
  })

  const analyzeImpact = asyncHandler(async (req, res) => {
    res.status(201).json(await services.events.analyzeImpact(req.body))
  })

  const getImpact = asyncHandler(async (req, res) => {
    res.json(await services.events.findImpact(req.params.id))
  })

  /* ---------------- Telemetria persistente (POST /api/telemetry, D4) ---------------- */

  const ingestTelemetry = asyncHandler(async (req, res) => {
    const body = req.body as { readings?: unknown } | unknown[]
    const readings = Array.isArray(body) ? body : ((body as { readings?: unknown[] })?.readings ?? [])
    res.status(202).json(await services.telemetry.ingest(readings))
  })

  return {
    health,
    live,
    ready,
    database,
    mqtt,
    summary,
    sectors,
    plants,
    dashboard,
    analytics,
    reports,
    listMachines,
    createMachine,
    getMachine,
    updateMachine,
    removeMachine,
    machineTelemetry,
    machineAnalytics,
    listAlerts,
    alertsSummary,
    advanceAlert,
    economy,
    listEconomyInterventions,
    createEconomyIntervention,
    listScenarioInterventions,
    createScenarioIntervention,
    competition,
    competitionDashboard,
    competitionAnalytics,
    competitionMachines,
    competitionMachine,
    competitionTelemetry,
    demoStatus,
    setScenario,
    resetDemo,
    stepDemo,
    listProtocols,
    protocolsSummary,
    createProtocol,
    getProtocol,
    advanceProtocol,
    addProtocolEvent,
    adminOverview,
    getTariffs,
    patchTariffs,
    getThresholds,
    patchThresholds,
    toggleShift,
    simTick,
    login,
    refresh,
    logout,
    me,
    changePassword,
    createInvite,
    listInvites,
    acceptInvite,
    listUsers,
    securityOverview,
    listAuditLogs,
    setUserRole,
    setUserStatus,
    listRelationships,
    createRelationship,
    updateRelationship,
    deleteRelationship,
    machineNetwork,
    machineContext,
    listEvents,
    listImpacts,
    analyzeImpact,
    getImpact,
    ingestTelemetry,
  }
}

export type Controllers = ReturnType<typeof createControllers>