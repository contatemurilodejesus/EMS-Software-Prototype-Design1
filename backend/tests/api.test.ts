/**
 * Testes FUNCIONAIS da API (secao 17.1 do documento).
 *
 * Executados contra a aplicacao real (Express + services + repositories em
 * memoria) em uma porta efemera - sem mocks de HTTP.
 *
 * Todas as chamadas autenticadas usam o access token obtido em
 * POST /api/auth/login: e o proprio token que carrega o `tenantId` (secao 7.1).
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

/** Token do Tenant A (ADMIN de demonstracao). */
let adminToken = ""
/** Token do Tenant B (usado no teste obrigatorio de isolamento). */
let tenantBToken = ""

const ADMIN_EMAIL = "admin@energymatrix.demo"
const ADMIN_PASSWORD = "demo-admin-2026"
const TENANT_B_EMAIL = "admin@empresa-b.demo"
const TENANT_B_PASSWORD = "demo-empresa-b-2026"

before(async () => {
  const env = buildEnvironment({
    NODE_ENV: "test",
    EMS_LIVE: "false",
    EMS_PERSISTENCE: "memory",
    LOG_LEVEL: "error",
    SEED_ADMIN_EMAIL: ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD: ADMIN_PASSWORD,
    SEED_TENANT_B_EMAIL: TENANT_B_EMAIL,
    SEED_TENANT_B_PASSWORD: TENANT_B_PASSWORD,
  })

  container = await createContainer(env)
  const app = createApp({ services: container.services, env, logger: container.logger })

  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening))
  })

  const address = server.address()
  const port = typeof address === "object" && address ? address.port : 0
  base = `http://127.0.0.1:${port}${env.apiPrefix}`

  // Sessao real dos dois tenants do seed (o login valida o hash scrypt).
  adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD)
  tenantBToken = await login(TENANT_B_EMAIL, TENANT_B_PASSWORD)
})

async function login(email: string, password: string): Promise<string> {
  const response = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const body = (await response.json()) as { accessToken?: string }
  assert.ok(body.accessToken, `login falhou para ${email}`)
  return body.accessToken as string
}

after(async () => {
  container.stop()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

function authHeaders(token = adminToken): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

async function get<T = unknown>(
  path: string,
  token = adminToken,
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${base}${path}`, { headers: authHeaders(token) })
  const body = response.status === 204 ? null : await response.json()
  return { status: response.status, body: body as T }
}

async function post<T = unknown>(
  path: string,
  body?: unknown,
  token = adminToken,
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  })
  const parsed = response.status === 204 ? null : await response.json()
  return { status: response.status, body: parsed as T }
}

async function patch<T = unknown>(
  path: string,
  body?: unknown,
  token = adminToken,
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${base}${path}`, {
    method: "PATCH",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  })
  const parsed = await response.json()
  return { status: response.status, body: parsed as T }
}

/** DELETE autenticado (usado no teste de isolamento entre tenants). */
async function del<T = unknown>(
  path: string,
  token = adminToken,
): Promise<{ status: number; body: T }> {
  const response = await fetch(`${base}${path}`, {
    method: "DELETE",
    headers: authHeaders(token),
  })
  const body = response.status === 204 ? null : await response.json().catch(() => null)
  return { status: response.status, body: body as T }
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

test("GET /api/machines devolve as maquinas do tenant com estado derivado", async () => {
  const { status, body } = await get<{ id: string; state: string }[]>("/machines")
  assert.equal(status, 200)
  // 10 maquinas da fabrica + M-001..M-003 do Competition Mode (secao 10.2).
  assert.equal(body.length, 13)
  // D18: STOPPED substitui OFF; ANOMALY/OFFLINE/MAINTENANCE sao sobreposicoes.
  assert.ok(
    body.every((m) => ["STOPPED", "IDLE", "RUNNING", "ANOMALY", "OFFLINE", "MAINTENANCE"].includes(m.state)),
  )
})

test("domínio legado é preservado: CNC-02 ANOMALY, CNC-04 STOPPED, CNC-03 IDLE", async () => {
  const cnc02 = await get<{ state: string; anomalyDesc: string }>("/machines/CNC-02")
  assert.equal(cnc02.body.state, "ANOMALY")
  assert.match(cnc02.body.anomalyDesc, /Temperatura|tensão/i)

  const cnc04 = await get<{ state: string }>("/machines/CNC-04")
  assert.equal(cnc04.body.state, "STOPPED")

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
  const response = await fetch(`${base}/rota-inexistente`, { headers: authHeaders() })
  const body = (await response.json()) as { error?: { code?: string; message?: string } }
  assert.equal(response.status, 404)
  assert.ok(body.error && typeof body.error.message === "string")

  const machine = await fetch(`${base}/machines/NAO-EXISTE`, { headers: authHeaders() })
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
  const response = await fetch(`${base}/machines`, { headers: authHeaders() })
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
/* ------------------------------------------------------------------ */
/* Autenticacao, RBAC e isolamento entre tenants (secoes 7 e 18.1)    */
/* ------------------------------------------------------------------ */

test("rotas protegidas exigem access token", async () => {
  const semToken = await fetch(`${base}/machines`)
  assert.equal(semToken.status, 401)

  const tokenInvalido = await get("/machines", "token.invalido")
  assert.equal(tokenInvalido.status, 401)
})

test("health permanece publico (probes de infraestrutura)", async () => {
  const response = await fetch(`${base}/health`)
  assert.equal(response.status, 200)
})

test("login devolve access + refresh e /auth/me devolve a identidade", async () => {
  const me = await get<{ user: { email: string; role: string }; tenant: { slug: string } }>(
    "/auth/me",
  )
  assert.equal(me.status, 200)
  assert.equal(me.body.user.email, ADMIN_EMAIL)
  assert.equal(me.body.user.role, "ADMIN")
  assert.ok(me.body.tenant.slug)
})

test("refresh rotaciona o token e o antigo deixa de valer", async () => {
  const response = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  const session = (await response.json()) as { accessToken: string; refreshToken: string }
  assert.ok(session.refreshToken)

  const refreshed = await fetch(`${base}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  })
  assert.equal(refreshed.status, 200)

  // O refresh token usado e revogado (rotacao - D5).
  const replay = await fetch(`${base}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: session.refreshToken }),
  })
  assert.equal(replay.status, 401)
})

test("credencial errada devolve mensagem generica (nao revela o e-mail)", async () => {
  const inexistente = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "ninguem@energymatrix.demo", password: "qualquer" }),
  })
  assert.equal(inexistente.status, 401)
  const body = (await inexistente.json()) as { error: { message: string } }
  assert.match(body.error.message, /[Cc]redenciais/)
})

test("ISOLAMENTO: o Tenant A nao acessa maquina do Tenant B (404, nem trocando o id)", async () => {
  const doTenantB = await get<{ id: string }[]>("/machines", tenantBToken)
  assert.equal(doTenantB.status, 200)
  const idB = doTenantB.body[0]?.id
  assert.ok(idB, "o seed do Tenant B deve ter ao menos uma maquina")

  // Ler, alterar e apagar com id do outro tenant respondem 404 (secao 7.1.3).
  assert.equal((await get(`/machines/${idB}`, adminToken)).status, 404)
  assert.equal((await patch(`/machines/${idB}`, { name: "invadido" })).status, 404)
  assert.equal((await del(`/machines/${idB}`)).status, 404)

  // E o Tenant B tambem nao alcanca a maquina do Tenant A.
  assert.equal((await get("/machines/INJ-01", tenantBToken)).status, 404)
})

test("ISOLAMENTO: listas e alertas nao vazam entre tenants", async () => {
  const a = await get<{ id: string; tenantId?: string }[]>("/alerts")
  const b = await get<{ id: string; tenantId?: string }[]>("/alerts", tenantBToken)

  assert.ok(a.body.every((alert) => alert.tenantId === undefined || alert.tenantId !== b.body[0]?.tenantId || alert.tenantId === a.body[0]?.tenantId))
  assert.ok(!b.body.some((alert) => a.body.some((own) => own.id === alert.id)))
})

test("ISOLAMENTO: relacoes do Tenant B nao aparecem para o Tenant A", async () => {
  const relacoesA = await get<{ id: string }[]>("/relationships")
  assert.ok(relacoesA.body.length > 0)

  const relacoesB = await get<{ id: string }[]>("/relationships", tenantBToken)
  assert.ok(!relacoesB.body.some((r) => relacoesA.body.some((own) => own.id === r.id)))
})

test("RBAC: rota /api/security e exclusiva de ADMIN", async () => {
  const comoAdmin = await get<{ roles: string[] }>("/security")
  assert.equal(comoAdmin.status, 200)
  assert.deepEqual(comoAdmin.body.roles, ["ADMIN", "ACCOUNTING", "MACHINE_EVALUATOR"])

  // O usuario comum do Tenant A e MACHINE_EVALUATOR: 403 (nao 404 - aqui a
  // rota existe; o isolamento entre tenants que responde 404).
  const evaluatorToken = await login("avaliador@energymatrix.demo", "demo-avaliador-2026")
  const comoAvaliador = await get("/security", evaluatorToken)
  assert.equal(comoAvaliador.status, 403)
})

test("convite de uso unico cria a conta e invalida o codigo", async () => {
  const convite = await post<{ id: string; code: string }>("/invites", {
    email: `novo.${Date.now()}@energymatrix.demo`,
    role: "ACCOUNTING",
  })
  assert.equal(convite.status, 201)
  assert.ok(convite.body.code)

  const primeiro = await fetch(`${base}/auth/invites/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: convite.body.code,
      name: "Usuario Convidado",
      password: "senha-forte-2026",
    }),
  })
  assert.equal(primeiro.status, 201)

  // Reuso do mesmo codigo e rejeitado (uso unico - secao 7.2).
  const segundo = await fetch(`${base}/auth/invites/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: convite.body.code,
      name: "Outro Usuario",
      password: "outra-senha-2026",
    }),
  })
  assert.equal(segundo.status, 401)
})

/* ------------------------------------------------------------------ */
/* Relacoes, eventos e analise de impacto (secao 11)                   */
/* ------------------------------------------------------------------ */

test("relacoes: valida auto-relacao, duplicidade, ciclo e tenant", async () => {
  const auto = await post("/relationships", {
    sourceMachineId: "INJ-01",
    targetMachineId: "INJ-01",
  })
  assert.equal(auto.status, 400)

  // M-001 -> M-002 ja existe no seed (SUPPLIES).
  const duplicada = await post("/relationships", {
    sourceMachineId: "M-001",
    targetMachineId: "M-002",
    relationshipType: "SUPPLIES",
  })
  assert.equal(duplicada.status, 409)

  // Fechar o ciclo M-002 -> M-001 e rejeitado.
  const ciclo = await post("/relationships", {
    sourceMachineId: "M-002",
    targetMachineId: "M-001",
    relationshipType: "SUPPLIES",
  })
  assert.equal(ciclo.status, 409)

  // Maquina de outro tenant responde 404.
  const alheia = await get<{ id: string }[]>("/machines", tenantBToken)
  const idAlheio = alheia.body[0]?.id
  assert.ok(idAlheio)
  const cruzada = await post("/relationships", {
    sourceMachineId: "INJ-01",
    targetMachineId: idAlheio,
  })
  assert.equal(cruzada.status, 404)

  const criada = await post<{ id: string; relationshipType: string }>("/relationships", {
    sourceMachineId: "CNC-01",
    targetMachineId: "PRENSA-01",
    relationshipType: "PARALLEL",
  })
  assert.equal(criada.status, 201)
  assert.equal(criada.body.relationshipType, "PARALLEL")

  assert.equal((await del(`/relationships/${criada.body.id}`)).status, 204)
})

test("Machine Network devolve o grafo vindo da API", async () => {
  const { status, body } = await get<{ nodes: { id: string }[]; edges: unknown[] }>(
    "/machines/network",
  )
  assert.equal(status, 200)
  assert.ok(body.nodes.length >= 10)
  assert.ok(body.edges.length > 0)
})

test("contexto da maquina traz upstream, downstream e impacto potencial", async () => {
  const { status, body } = await get<{
    machine: { id: string }
    upstream: { id: string }[]
    downstream: { id: string }[]
    impactedDownstream: string[]
  }>("/machines/M-002/context")

  assert.equal(status, 200)
  assert.equal(body.machine.id, "M-002")
  assert.ok(body.upstream.some((u) => u.id === "M-001"))
  assert.ok(body.downstream.some((d) => d.id === "M-003"))
  assert.ok(body.impactedDownstream.includes("M-003"))
})

test("analise de impacto registra evidencia e classificacao", async () => {
  // Cascata: M-001 STOPPED e M-002/M-003 IDLE ha mais de P1 (10 min).
  // A primeira leitura (RUNNING, mais antiga) forca a troca de estado para que
  // o intervalo de IDLE comece em `janela`, nao no estado corrente.
  const janela = new Date(Date.now() - 20 * 60_000).toISOString()
  const anterior = new Date(Date.now() - 21 * 60_000).toISOString()

  const ingestao = await post<{ persisted: number; states: Record<string, string> }>(
    "/telemetry",
    {
      readings: [
        { machineId: "M-001", ts: anterior, powerKw: 8, temperatureC: 42 },
        { machineId: "M-002", ts: anterior, powerKw: 12.8, temperatureC: 47 },
        { machineId: "M-003", ts: anterior, powerKw: 6, temperatureC: 41 },
        { machineId: "M-001", ts: janela, powerKw: 0.1, temperatureC: 40 },
        { machineId: "M-002", ts: janela, powerKw: 3, temperatureC: 48 },
        { machineId: "M-003", ts: janela, powerKw: 1.5, temperatureC: 41 },
      ],
    },
  )
  assert.equal(ingestao.body.persisted, 6)
  // M-002 e M-003 ficam IDLE; M-001 cai para STOPPED/IDLE (histerese aplicada).
  assert.equal(ingestao.body.states["M-002"], "IDLE")
  assert.equal(ingestao.body.states["M-003"], "IDLE")

  const { status, body } = await post<{
    avoidableKwh: number
    estimatedCost: number
    classification: string
    evidence: Record<string, unknown>
  }>("/impacts/analyze", {
    machineId: "M-001",
    windowStart: janela,
    windowEnd: new Date().toISOString(),
  })

  
  assert.equal(status, 201)
  // Secao 12.1: telemetria do simulador e sempre SIMULATED.
  assert.equal(body.classification, "SIMULATED")
  assert.ok(body.evidence.originMachine)
  assert.ok(Array.isArray(body.evidence.downstream))
  // (P - P_OFF) x horas das maquinas a jusante em IDLE.
  assert.ok(body.avoidableKwh > 0)
  assert.ok(body.estimatedCost > 0)
})

test("analise sem maquina a jusante em IDLE devolve zero estimado", async () => {
  const { status, body } = await post<{ avoidableKwh: number }>("/impacts/analyze", {
    machineId: "PRENSA-01",
  })
  assert.equal(status, 201)
  assert.equal(body.avoidableKwh, 0)
})


test("eventos aceitam filtro por maquina", async () => {
  const { status, body } = await get<{ machineId: string }[]>("/events?machineId=M-001")
  assert.equal(status, 200)
  assert.ok(Array.isArray(body))
  assert.ok(body.every((event) => event.machineId === "M-001"))
})

/* ------------------------------------------------------------------ */
/* Telemetria persistente (D4)                                         */
/* ------------------------------------------------------------------ */

test("POST /api/telemetry ingere pelo mesmo pipeline e deduplica (machine_id, ts)", async () => {
  const ts = "2026-10-03T12:00:00.000Z"
  const payload = {
    readings: [{ machineId: "INJ-01", ts, powerKw: 30.5, voltageV: 380, currentA: 46 }],
  }

  const primeira = await post<{ received: number; persisted: number }>("/telemetry", payload)
  assert.equal(primeira.status, 202)
  assert.equal(primeira.body.received, 1)
  assert.equal(primeira.body.persisted, 1)

  const segunda = await post<{ persisted: number; duplicated: number }>("/telemetry", payload)
  assert.equal(segunda.body.persisted, 0)
  assert.equal(segunda.body.duplicated, 1)
})

test("POST /api/telemetry rejeita leitura de maquina de outro tenant", async () => {
  const doTenantB = await get<{ id: string }[]>("/machines", tenantBToken)
  const idB = doTenantB.body[0]?.id

  const { body } = await post<{ unresolved: number }>("/telemetry", {
    readings: [{ machineId: idB, ts: "2026-10-03T12:05:00.000Z", powerKw: 5 }],
  })
  assert.equal(body.unresolved, 1)
})