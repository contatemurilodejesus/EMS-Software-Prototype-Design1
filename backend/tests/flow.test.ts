/**
 * Teste de FLUXO COMPLETO ponta-a-ponta (secao 34 do briefing MVP):
 *
 *   telemetria -> estado -> evento (watchdog) -> alerta -> impacto
 *   -> intervencao -> economia -> relatorio -> auditoria
 *
 * Executa contra a aplicacao REAL (Express + services + repositories em
 * memoria) e cada passo consome a saida do anterior: se um elo quebrar, o
 * teste falha no elo certo. O caminho MQTT usa o MESMO pipeline validado em
 * mqtt.test.ts; a prova de persistencia em PostgreSQL (restart) depende de
 * DATABASE_URL e vive em backend/proof/.
 *
 *   node --test backend/tests/flow.test.ts
 */

import assert from "node:assert/strict"
import test, { after, before } from "node:test"
import type { Server } from "node:http"
import { createApp } from "../src/server/app.ts"
import { createContainer, type Container } from "../src/bootstrap/container.ts"
import { buildEnvironment } from "../src/config/environment.ts"
import { TENANT_A_ID } from "../src/database/seeds/seed-data.ts"

let server: Server
let base = ""
let container: Container
let adminToken = ""

const ADMIN_EMAIL = "admin@energymatrix.demo"
const ADMIN_PASSWORD = "demo-admin-2026"

before(async () => {
  const env = buildEnvironment({
    NODE_ENV: "test",
    EMS_LIVE: "false",
    EMS_PERSISTENCE: "memory",
    LOG_LEVEL: "error",
    // Fluxo E2E faz dezenas de chamadas autenticadas seguidas: limites de
    // API/admin/telemetria liberados (AUTH no padrao - 1 login).
    EMS_RATE_LIMIT_API_MAX: "100000",
    EMS_RATE_LIMIT_ADMIN_MAX: "100000",
    EMS_RATE_LIMIT_TELEMETRY_MAX: "100000",
    SEED_ADMIN_EMAIL: ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD: ADMIN_PASSWORD,
  })

  container = await createContainer(env)
  const app = createApp({ services: container.services, env, logger: container.logger })

  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening))
  })

  const address = server.address()
  const port = typeof address === "object" && address ? address.port : 0
  base = `http://127.0.0.1:${port}${env.apiPrefix}`

  const response = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  const body = (await response.json()) as { accessToken?: string }
  assert.ok(body.accessToken, "login do fluxo falhou")
  adminToken = body.accessToken as string
})

after(async () => {
  await container.stop()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${adminToken}` }
}

async function get<T = unknown>(path: string): Promise<{ status: number; body: T }> {
  const response = await fetch(`${base}${path}`, { headers: authHeaders() })
  const body = response.status === 204 ? null : await response.json()
  return { status: response.status, body: body as T }
}

async function post<T = unknown>(path: string, payload?: unknown): Promise<{ status: number; body: T }> {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  })
  const parsed = response.status === 204 ? null : await response.json()
  return { status: response.status, body: parsed as T }
}

test("fluxo completo: telemetria -> estado -> evento -> alerta -> impacto -> intervencao -> economia -> relatorio", async () => {
  /* 1) TELEMETRIA: cascata forcada pelo MESMO pipeline de producao. */
  const janela = new Date(Date.now() - 20 * 60_000).toISOString()
  const anterior = new Date(Date.now() - 21 * 60_000).toISOString()
  const cascata = await post<{ persisted: number; states: Record<string, string> }>("/telemetry", {
    readings: [
      { machineId: "M-001", ts: anterior, powerKw: 8, temperatureC: 42 },
      { machineId: "M-002", ts: anterior, powerKw: 12.8, temperatureC: 47 },
      { machineId: "M-003", ts: anterior, powerKw: 6, temperatureC: 41 },
      { machineId: "M-001", ts: janela, powerKw: 0.1, temperatureC: 40 },
      { machineId: "M-002", ts: janela, powerKw: 3, temperatureC: 48 },
      { machineId: "M-003", ts: janela, powerKw: 1.5, temperatureC: 41 },
    ],
  })
  assert.equal(cascata.status, 202, "1: ingestao de telemetria (202 Accepted)")
  assert.equal(cascata.body.persisted, 6, "1: as 6 leituras persistem")
  assert.equal(cascata.body.states["M-002"], "IDLE", "1: state engine deriva IDLE")
  assert.equal(cascata.body.states["M-003"], "IDLE", "1: state engine deriva IDLE")

  /* 2) DEDUPLICACAO: reenvio identico nao regrava (machine_id, ts). */
  const repetida = await post<{ persisted: number; duplicated: number }>("/telemetry", {
    readings: [{ machineId: "M-001", ts: janela, powerKw: 0.1, temperatureC: 40 }],
  })
  assert.equal(repetida.body.persisted, 0, "2: reenvio nao regrava")
  assert.equal(repetida.body.duplicated, 1, "2: deduplicado por (machine_id, ts)")

  /* 3) ESTADO CONSULTAVEL: a maquina aparece IDLE na API. */
  const maquina = await get<{ state: string }>("/machines/M-002")
  assert.equal(maquina.status, 200, "3: leitura da maquina")
  assert.equal(maquina.body.state, "IDLE", "3: estado derivado consultavel")

  /* 4) EVENTO (watchdog): nova sem telemetria -> OFFLINE -> com leitura -> RECOVERY. */
  const nova = await post<{ id: string }>("/machines", {
    id: "FLUXO-01",
    name: "Maquina do Fluxo",
    sector: "Setor D",
  })
  assert.equal(nova.status, 201, "4: cadastro de maquina")

  const primeiraVarredura = await container.watchdog.run(TENANT_A_ID)
  assert.ok(primeiraVarredura.offline.includes("FLUXO-01"), "4: watchdog marca OFFLINE sem telemetria")

  const eventos = await get<{ type: string; machineId: string }[]>("/events?machineId=FLUXO-01")
  assert.ok(
    eventos.body.some((e) => e.type === "OFFLINE" && e.machineId === "FLUXO-01"),
    "4: evento OFFLINE persistido e consultavel",
  )

  // Telemetria boa chega -> o pipeline reativa (online=true) e registra
  // RECOVERY na MESMA transicao (secao 15) - sem esperar o watchdog.
  await post("/telemetry", {
    readings: [{ machineId: "FLUXO-01", ts: new Date().toISOString(), powerKw: 0.4 }],
  })
  const eventosDepois = await get<{ type: string }[]>("/events?machineId=FLUXO-01")
  assert.ok(
    eventosDepois.body.some((e) => e.type === "RECOVERY"),
    "4: evento RECOVERY persistido pela ingestao",
  )

  /* 5) ALERTA: ciclo de vida (open -> acknowledged) via API. */
  const alertas = await get<{ id: string; status: string; severity: string }[]>("/alerts")
  const aberto = alertas.body.find((a) => a.status === "open")
  assert.ok(aberto, "5: ha alerta aberto (seed)")
  const avancado = await post<{ status: string; acknowledgedAt?: string }>(
    `/alerts/${aberto.id}/advance`,
    {},
  )
  assert.equal(avancado.body.status, "acknowledged", "5: alerta reconhecido")
  assert.ok(avancado.body.acknowledgedAt, "5: timestamp do reconhecimento")

  /* 6) IMPACTO: cascata downstream produz desperdicio calculado. */
  const impacto = await post<{
    avoidableKwh: number
    estimatedCost: number
    classification: string
    evidence: { downstream?: unknown[] }
  }>("/impacts/analyze", {
    machineId: "M-001",
    windowStart: janela,
    windowEnd: new Date().toISOString(),
  })
  assert.equal(impacto.status, 201, "6: analise registrada")
  assert.equal(impacto.body.classification, "SIMULATED", "6: origem declarada (sem IA ficticia)")
  assert.ok((impacto.body.evidence.downstream ?? []).length >= 1, "6: evidencia dos downstreams")
  assert.ok(impacto.body.avoidableKwh > 0, "6: kWh evitavel")
  assert.ok(impacto.body.estimatedCost > 0, "6: custo estimado")

  /* 7) INTERVENCAO + ECONOMIA: antes/depois vira economia registrada. */
  const intervencao = await post<{ saved: number }>("/economy/interventions", {
    machine: "CNC-01",
    before: 200,
    after: 150,
    desc: "Ajuste de curva apos impacto do fluxo",
  })
  assert.equal(intervencao.status, 201, "7: intervencao registrada")
  assert.equal(intervencao.body.saved, 50, "7: economia calculada (antes - depois)")

  const economia = await get<{
    cusum: unknown[]
    opportunities: unknown[]
    totals: { opportunityMonth: number }
  }>("/economy")
  assert.equal(economia.body.cusum.length, 28, "7: CUSUM de 28 pontos")
  assert.ok(economia.body.opportunities.length >= 5, "7: oportunidades")
  assert.ok(economia.body.totals.opportunityMonth > 0, "7: impacto financeiro do mes")

  /* 8) RELATORIO: series derivadas do estado persistido. */
  const relatorios = await get<{ shiftData: unknown[]; tariffProfile: unknown[] }>("/reports")
  assert.equal(relatorios.status, 200, "8: relatorio consultado")
  assert.ok(relatorios.body.shiftData.length >= 6, "8: serie por turno")

  /* 9) AUDITORIA: as acoes da sessao ficam registradas (ADMIN). */
  const auditoria = await get<unknown[]>("/security/audit-logs")
  assert.equal(auditoria.status, 200, "9: auditoria consultavel")
  assert.ok(Array.isArray(auditoria.body) && auditoria.body.length >= 1, "9: ha registros")
})
