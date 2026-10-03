/**
 * Testes FUNCIONAIS da API (secao 17.1 do documento).
 *
 * Executados contra a aplicacao real (Express + services + repositories em
 * memoria) em uma porta efemera - sem mocks de HTTP.
 *
 *   node --test backend/tests/
 */

import assert from "node:assert/strict"
import test, { after, before } from "node:test"
import type { Server } from "node:http"
import { createApp } from "../src/server/app.ts"
import { createContainer, type Container } from "../src/bootstrap/container.ts"
import { buildEnvironment } from "../src/config/environment.ts"

let server: Server
let base = ""
let container: Container

before(async () => {
  const env = buildEnvironment({
    NODE_ENV: "test",
    EMS_LIVE: "false",
    EMS_PERSISTENCE: "memory",
    LOG_LEVEL: "error",
  })

  container = await createContainer(env)
  const app = createApp({ services: container.services, env, logger: container.logger })

  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening))
  })

  const address = server.address()
  const port = typeof address === "object" && address ? address.port : 0
  base = `http://127.0.0.1:${port}${env.apiPrefix}`
})

after(async () => {
  container.stop()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

async function get<T = unknown>(path: string): Promise<{ status: number; body: T }> {
  const response = await fetch(`${base}${path}`)
  const body = response.status === 204 ? null : await response.json()
  return { status: response.status, body: body as T }
}

async function post<T = unknown>(path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  })
  const parsed = response.status === 204 ? null : await response.json()
  return { status: response.status, body: parsed as T }
}

async function patch<T = unknown>(path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(`${base}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  })
  const parsed = await response.json()
  return { status: response.status, body: parsed as T }
}

async function stepN(n: number): Promise<void> {
  for (let i = 0; i < n; i += 1) await post("/demo/step")
}

test("GET /api/health responde 200 com o contrato atual", async () => {
  const { status, body } = await get<{ status: string; service: string; version: string }>("/health")
  assert.equal(status, 200)
  assert.equal(body.status, "ok")
  assert.equal(body.service, "energymatrix-ems-api")
  assert.equal(body.version, "2.0.0")
})

test("liveness e readiness respondem", async () => {
  const live = await get<{ status: string }>("/health/live")
  assert.equal(live.status, 200)
  assert.equal(live.body.status, "ok")

  const ready = await get<{ status: string; checks: { database: string } }>("/health/ready")
  assert.equal(ready.status, 200)
  assert.equal(ready.body.checks.database, "ok")
})

test("GET /api/machines devolve as 10 máquinas com estado derivado", async () => {
  const { status, body } = await get<{ id: string; state: string }[]>("/machines")
  assert.equal(status, 200)
  assert.equal(body.length, 10)
  assert.ok(body.every((m) => ["OFF", "IDLE", "RUNNING", "ANOMALY"].includes(m.state)))
})

test("domínio legado é preservado: CNC-02 ANOMALY, CNC-04 OFF, CNC-03 IDLE", async () => {
  const cnc02 = await get<{ state: string; anomalyDesc: string }>("/machines/CNC-02")
  assert.equal(cnc02.body.state, "ANOMALY")
  assert.match(cnc02.body.anomalyDesc, /Temperatura|tensão/i)

  const cnc04 = await get<{ state: string }>("/machines/CNC-04")
  assert.equal(cnc04.body.state, "OFF")

  const cnc03 = await get<{ state: string; idleCostDay: number }>("/machines/CNC-03")
  assert.equal(cnc03.body.state, "IDLE")
  assert.ok(cnc03.body.idleCostDay > 0)
})

test("ciclo de alertas (ABERTO -> RECONHECIDO) com evidência", async () => {
  const summary = await get<{ openCritical: number; openIdle: number }>("/alerts/summary")
  assert.ok(summary.body.openCritical >= 1)
  assert.ok(summary.body.openIdle >= 2)

  const advanced = await post<{ status: string; acknowledgedAt?: string }>(
    "/alerts/ALT-2026-0041/advance",
    {},
  )
  assert.equal(advanced.body.status, "acknowledged")
  assert.ok(advanced.body.acknowledgedAt)
})

test("economia: CUSUM, oportunidades e intervenção registrada", async () => {
  const created = await post<{ saved: number }>("/economy/interventions", {
    machine: "CNC-01",
    before: 200,
    after: 150,
    desc: "Teste",
  })
  assert.equal(created.status, 201)
  assert.equal(created.body.saved, 50)

  const economy = await get<{
    cusum: unknown[]
    opportunities: unknown[]
    totals: { opportunityMonth: number }
  }>("/economy")
  assert.equal(economy.body.cusum.length, 28)
  assert.ok(economy.body.opportunities.length >= 5)
  assert.ok(economy.body.totals.opportunityMonth > 0)
})

test("visão da fábrica: totais, setores, curva 24 h e qualidade", async () => {
  const { body } = await get<{
    sectors: unknown[]
    totals: { kwh: number }
    consumption: unknown[]
    dataQuality: unknown[]
  }>("/summary")
  assert.ok(body.sectors.length >= 4)
  assert.ok(body.totals.kwh > 0)
  assert.equal(body.consumption.length, 24)
  assert.ok(Array.isArray(body.dataQuality))
})

test("relatórios devolvem as séries do protótipo", async () => {
  const { body } = await get<{ shiftData: unknown[]; tariffProfile: unknown[] }>("/reports")
  assert.ok(body.shiftData.length >= 6)
  assert.ok(body.tariffProfile.length >= 12)
})

test("administração: tarifas e limiares são configuráveis", async () => {
  const tariffs = await patch<{ peak: number }>("/admin/tariffs", { peak: 2.5 })
  assert.equal(tariffs.body.peak, 2.5)

  const thresholds = await get<{ temperatureCriticalC: number }>("/admin/thresholds")
  assert.equal(thresholds.body.temperatureCriticalC, 85)

  const admin = await get<{ machines: unknown[]; shifts: unknown[] }>("/admin")
  assert.ok(admin.body.machines.length >= 10)
  assert.ok(admin.body.shifts.length >= 1)
})

test("cadastro de máquina: 201, conflito 409 e validação 400", async () => {
  const created = await post<{ id: string }>("/machines", {
    id: "TEST-99",
    name: "Máquina Teste",
    sector: "Setor D",
  })
  assert.equal(created.status, 201)
  assert.equal(created.body.id, "TEST-99")

  const duplicated = await post("/machines", { id: "TEST-99" })
  assert.equal(duplicated.status, 409)

  const invalid = await post("/machines", {})
  assert.equal(invalid.status, 400)
})

test("erros seguem o padrão único { error: { code, message } }", async () => {
  const response = await fetch(`${base}/rota-inexistente`)
  const body = (await response.json()) as { error?: { code?: string; message?: string } }
  assert.equal(response.status, 404)
  assert.ok(body.error && typeof body.error.message === "string")

  const machine = await fetch(`${base}/machines/NAO-EXISTE`)
  const machineBody = (await machine.json()) as { error?: { code?: string } }
  assert.equal(machine.status, 404)
  assert.equal(machineBody.error?.code, "MACHINE_NOT_FOUND")
})

test("POST /api/sim/tick avança a telemetria (ingestão determinística)", async () => {
  const { status, body } = await post<{ tickCount: number; machines: number }>("/sim/tick")
  assert.equal(status, 200)
  assert.ok(body.machines >= 10)
  assert.ok(body.tickCount >= 1)
})

interface Competition {
  scenario: string
  step: number
  targetMachine: string | null
  kpis: { wasteKwh: number; wasteBrl: number; alerts: number }
  machines: {
    id: string
    state: string
    online: boolean
    quality: string
    power: number
    deviationPct: number
    temperature: number
    idleMinutes?: number
  }[]
  alerts: { id: string; status: string; anomalyType: string; severity: string }[]
  beforeAfter: { savedKwhDay: number; savedBrlDay: number; estimated: boolean } | null
}

test("Competition Mode inicia em NORMAL com as 3 máquinas", async () => {
  const { body } = await get<Competition>("/demo/status")
  assert.equal(body.scenario, "NORMAL")
  assert.equal(body.step, 0)
  assert.equal(body.machines.length, 3)
  assert.equal(body.alerts.length, 0)
})

test("cenário IDLE gera energia/kWh e R$ improdutivos em M-001", async () => {
  const scenario = await post<Competition>("/demo/scenario", { scenario: "IDLE" })
  assert.equal(scenario.body.targetMachine, "M-001")

  await stepN(30)

  const competition = await get<Competition>("/competition")
  const m001 = competition.body.machines.find((m) => m.id === "M-001")
  assert.ok(m001)
  assert.equal(m001.state, "IDLE")
  assert.ok((m001.idleMinutes ?? 0) > 0)
  assert.ok(competition.body.kpis.wasteKwh > 0)
  assert.ok(competition.body.kpis.wasteBrl > 0)
})

test("telemetria da máquina do demo é uma série determinística", async () => {
  const { body } = await get<{ machineId: string; simulated: boolean; points: unknown[] }>(
    "/machines/M-001/telemetry",
  )
  assert.equal(body.simulated, true)
  assert.equal(body.points.length, 31)
})

test("cenário ANOMALY mostra +50% sobre a baseline com evidência", async () => {
  await post<Competition>("/demo/scenario", { scenario: "ANOMALY" })
  await stepN(4)

  const { body } = await get<Competition>("/competition")
  const m002 = body.machines.find((m) => m.id === "M-002")
  assert.ok(m002)
  assert.ok(m002.power >= 14 && m002.power <= 16, `P esperado ~15 kW, obtido ${m002.power}`)
  assert.ok(
    m002.deviationPct >= 45 && m002.deviationPct <= 55,
    `desvio esperado ~+50%, obtido ${m002.deviationPct}%`,
  )
  assert.equal(m002.state, "ANOMALY")
  assert.ok(body.alerts.some((a) => a.severity === "critical"))
})

test("cenário THERMAL mantém alerta térmico persistente", async () => {
  await post<Competition>("/demo/scenario", { scenario: "THERMAL" })
  await stepN(20)

  const { body } = await get<Competition>("/competition")
  const m002 = body.machines.find((m) => m.id === "M-002")
  assert.ok(m002)
  assert.ok(m002.temperature >= 85, `T esperada >= 85 °C, obtida ${m002.temperature}`)
  assert.ok(body.alerts.some((a) => a.anomalyType === "Temperatura"))
})

test("cenário OFFLINE marca ausência de telemetria (MISSING, não zero)", async () => {
  await post<Competition>("/demo/scenario", { scenario: "OFFLINE" })
  await stepN(4)

  const { body } = await get<Competition>("/competition")
  const m003 = body.machines.find((m) => m.id === "M-003")
  assert.ok(m003)
  assert.equal(m003.online, false)
  assert.equal(m003.quality, "MISSING")
})

test("cenário RECOVERY prova o ANTES x DEPOIS (-30%)", async () => {
  await post<Competition>("/demo/scenario", { scenario: "RECOVERY" })
  await stepN(14)

  const { body } = await get<Competition>("/competition")
  assert.ok(body.beforeAfter)
  assert.ok(body.beforeAfter.savedKwhDay > 0)
  assert.ok(body.beforeAfter.savedBrlDay > 0)
  assert.equal(body.beforeAfter.estimated, true)
})

test("intervenção do demo calcula a economia simulada", async () => {
  const { status, body } = await post<{ saved: number; simulated: boolean }>("/interventions", {
    machineId: "M-001",
    before: 48,
    after: 33,
  })
  assert.equal(status, 201)
  assert.equal(body.saved, 15)
  assert.equal(body.simulated, true)
})

test("reprodutibilidade: mesmo cenário + mesmos passos = mesmos números", async () => {
  const run = async (): Promise<string> => {
    await post("/demo/reset")
    await post("/demo/scenario", { scenario: "IDLE" })
    await stepN(25)
    const { body } = await get<Competition>("/competition")
    return JSON.stringify([
      body.kpis,
      body.machines.map((m) => [m.power, m.temperature, m.state]),
    ])
  }

  const first = await run()
  const second = await run()
  assert.equal(first, second)
})

test("POST /api/demo/reset volta ao estado inicial", async () => {
  await post("/demo/reset")
  const { body } = await get<Competition>("/demo/status")
  assert.equal(body.scenario, "NORMAL")
  assert.equal(body.step, 0)
  assert.equal(body.alerts.length, 0)
})

test("módulo protocolar: lista, summary, ciclo de vida e criação numerada", async () => {
  const list = await get<{ id: string; sla: string; deadline: string }[]>("/protocols")
  assert.ok(list.body.length >= 3)
  assert.ok(list.body.every((p) => typeof p.sla === "string" && typeof p.deadline === "string"))

  const summary = await get<{ total: number; byStatus: object; bySla: object }>(
    "/protocols/summary",
  )
  assert.ok(summary.body.total >= 3)
  assert.equal(typeof summary.body.byStatus, "object")
  assert.equal(typeof summary.body.bySla, "object")

  const advanced = await post<{ events: unknown[] }>("/protocols/EMS-2026-0003/advance", {})
  assert.equal(advanced.status, 200)
  assert.ok(advanced.body.events.length >= 4)

  const created = await post<{ id: string; status: string }>("/protocols", {
    title: "Teste protocolo",
    machineId: "CNC-01",
    priority: "low",
  })
  assert.equal(created.status, 201)
  assert.match(created.body.id, /^EMS-\d{4}-\d{4}$/)
  assert.equal(created.body.status, "open")

  const missing = await get("/protocols/INEXISTENTE")
  assert.equal(missing.status, 404)
})

test("listas devolvem metadados no header X-Total-Count", async () => {
  const response = await fetch(`${base}/machines`)
  assert.equal(response.status, 200)
  assert.ok(Number(response.headers.get("x-total-count")) >= 10)
})

test("analytics do demo expõe idle, anomalies e cost", async () => {
  const idle = await get<{ totalIdleEnergyKwh: number; estimated: boolean }>("/analytics/idle")
  assert.equal(idle.body.estimated, true)

  const cost = await get<{ ratePerKwh: number }>("/analytics/cost")
  assert.ok(cost.body.ratePerKwh > 0)

  const anomalies = await get<unknown[]>("/analytics/anomalies")
  assert.ok(Array.isArray(anomalies.body))
})