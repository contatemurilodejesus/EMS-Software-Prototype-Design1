/**
 * Smoke test do backend EMS (sem rede): exercita as rotas via createApi().
 *   node server/smoke.mjs
 */

import assert from "node:assert/strict"

import { createApi } from "./api.mjs"

let passed = 0

const check = (name, fn) => {
  try {
    fn()
    passed += 1
    console.log(`  ok  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`)
    process.exitCode = 1
  }
}

const api = createApi({ live: false })

const call = (method, path, body) =>
  api.handle({ method, path, query: {}, body })

console.log("EnergyMatrix EMS — smoke test\n")

const run = async () => {
  let r = await call("GET", "/api/health")

  check("GET /api/health → ok", () => {
    assert.equal(r.status, 200)

    assert.equal(r.body.status, "ok")

    assert.equal(r.body.service, "energymatrix-ems-api")
  })

  r = await call("GET", "/api/machines")

  check("GET /api/machines → 10 máquinas com estado", () => {
    assert.equal(r.status, 200)

    assert.equal(r.body.length, 10)

    assert.ok(
      r.body.every((m) =>
        ["OFF", "IDLE", "RUNNING", "ANOMALY"].includes(m.state),
      ),
    )
  })

  r = await call("GET", "/api/machines/CNC-02")

  check("CNC-02 classificada como ANOMALY (temp 103°C)", () => {
    assert.equal(r.body.state, "ANOMALY")

    assert.ok(
      r.body.anomalyDesc && /Temperatura|tensão/i.test(r.body.anomalyDesc),
    )
  })

  r = await call("GET", "/api/machines/CNC-04")

  check("CNC-04 classificada como OFF (P=0)", () => {
    assert.equal(r.body.state, "OFF")
  })

  r = await call("GET", "/api/machines/CNC-03")

  check("CNC-03 IDLE com custo estimado", () => {
    assert.equal(r.body.state, "IDLE")

    assert.ok(r.body.idleCostDay > 0)
  })

  r = await call("GET", "/api/alerts/summary")

  check("GET /api/alerts/summary", () => {
    assert.ok(r.body.openCritical >= 1)

    assert.ok(r.body.openIdle >= 2)
  })

  r = await call("POST", "/api/alerts/ALT-2026-0041/advance", {})

  check("POST /api/alerts/:id/advance → acknowledged", () => {
    assert.equal(r.body.status, "acknowledged")

    assert.ok(r.body.acknowledgedAt)
  })

  r = await call("POST", "/api/economy/interventions", {
    machine: "CNC-01",
    before: 200,
    after: 150,
    desc: "Teste",
  })

  check("POST /api/economy/interventions → saved calculado", () => {
    assert.equal(r.status, 201)

    assert.equal(r.body.saved, 50)
  })

  r = await call("GET", "/api/economy")

  check("GET /api/economy → cusum/opportunities/interventions", () => {
    assert.equal(r.body.cusum.length, 28)

    assert.ok(r.body.opportunities.length >= 5)

    assert.ok(r.body.totals.opportunityMonth > 0)
  })

  r = await call("GET", "/api/summary")

  check("GET /api/summary → totais e setores", () => {
    assert.ok(r.body.sectors.length >= 4)

    assert.ok(r.body.totals.kwh > 0)

    assert.equal(r.body.consumption.length, 24)

    assert.ok(Array.isArray(r.body.dataQuality))
  })

  r = await call("GET", "/api/reports")

  check("GET /api/reports → 4 séries", () => {
    assert.ok(r.body.shiftData.length >= 6)

    assert.ok(r.body.tariffProfile.length >= 12)
  })

  r = await call("PATCH", "/api/admin/tariffs", { peak: 2.5 })

  check("PATCH /api/admin/tariffs → tarifa atualizada", () => {
    assert.equal(r.body.peak, 2.5)
  })

  r = await call("POST", "/api/machines", {
    id: "TEST-99",
    name: "Máquina Teste",
    nominalKW: 20,
    pRun: 10,
    power: 12,
  })

  check("POST /api/machines → criada máquina", () => {
    assert.equal(r.status, 201)

    assert.equal(r.body.id, "TEST-99")
  })

  r = await call("POST", "/api/machines", { id: "TEST-99" })

  check("POST /api/machines duplicada → 409", () => {
    assert.equal(r.status, 409)
  })

  r = await call("POST", "/api/sim/tick")

  check("POST /api/sim/tick → telemetria avança", () => {
    assert.equal(r.status, 200)

    assert.equal(r.body.tickCount, 1)
  })

  r = await call("GET", "/api/nao-existe")

  check("rota inválida → 404", () => {
    assert.equal(r.status, 404)
  })

  /* ---------------- Competition Mode (demo determinístico) ---------------- */

  r = await call("GET", "/api/demo/status")

  check("GET /api/demo/status → cenário NORMAL + 3 máquinas", () => {
    assert.equal(r.status, 200)

    assert.equal(r.body.scenario, "NORMAL")

    assert.equal(r.body.simulated, true)

    assert.equal(r.body.kpis.machines, 3)
  })

  r = await call("POST", "/api/demo/scenario", { scenario: "IDLE" })

  check("POST /api/demo/scenario IDLE → alvo M-001", () => {
    assert.equal(r.body.scenario, "IDLE")

    assert.equal(r.body.targetMachine, "M-001")
  })

  const stepN = async (n) => {
    for (let i = 0; i < n; i += 1) await call("POST", "/api/demo/step")
  }

  await stepN(30)

  r = await call("GET", "/api/competition")

  check("IDLE → M-001 em IDLE com energia/kWh improdutiva e R$", () => {
    const m = r.body.machines.find((x) => x.id === "M-001")

    assert.equal(m.state, "IDLE")

    assert.ok(m.idleMinutes >= 30)

    assert.ok(r.body.analytics.idle.totalIdleEnergyKwh > 0)

    assert.ok(r.body.kpis.wasteBrl >= 0)
  })

  r = await call("GET", "/api/machines/M-001/telemetry")

  check("GET /api/machines/:id/telemetry → série determinística", () => {
    assert.equal(r.body.points.length, 31)

    assert.equal(r.body.points[0].ts, "T+0min")
  })

  await call("POST", "/api/demo/scenario", { scenario: "ANOMALY" })

  await stepN(4)

  r = await call("GET", "/api/competition/machines/M-002")

  check("ANOMALY → M-002 com desvio de baseline e alerta", () => {
    assert.equal(r.body.state, "ANOMALY")

    assert.ok(Math.abs(r.body.deviationPct) >= 30)

    assert.ok(/baseline/i.test(r.body.anomalyDesc ?? ""))
  })

  await call("POST", "/api/demo/scenario", { scenario: "THERMAL" })

  await stepN(18)

  r = await call("GET", "/api/competition/machines/M-002")

  check("THERMAL → alerta térmico persistente", () => {
    assert.equal(r.body.state, "ANOMALY")

    assert.ok(r.body.temperature >= 85)

    assert.ok(/Temperatura/i.test(r.body.anomalyDesc ?? ""))
  })

  await call("POST", "/api/demo/scenario", { scenario: "OFFLINE" })

  await stepN(6)

  r = await call("GET", "/api/competition/machines/M-003")

  check("OFFLINE → M-003 sem telemetria (MISSING)", () => {
    assert.equal(r.body.online, false)

    assert.equal(r.body.quality, "MISSING")
  })

  await call("POST", "/api/demo/scenario", { scenario: "RECOVERY" })

  await stepN(14)

  r = await call("GET", "/api/competition")

  check("RECOVERY → comparação ANTES × DEPOIS positiva", () => {
    assert.ok(r.body.beforeAfter)

    assert.ok(r.body.beforeAfter.savedKwhDay > 0)

    assert.ok(r.body.beforeAfter.savedBrlDay > 0)

    assert.equal(r.body.beforeAfter.estimated, true)
  })

  r = await call("POST", "/api/interventions", {
    machineId: "M-001",
    before: 48,
    after: 33,
  })

  check("POST /api/interventions → economia calculada", () => {
    assert.equal(r.status, 201)

    assert.equal(r.body.saved, 15)

    assert.equal(r.body.simulated, true)
  })

  /* ---------------- Determinismo (mesmo cenário = mesmo resultado) ---------------- */

  const runScenario = async (name, steps) => {
    await call("POST", "/api/demo/reset")

    await call("POST", "/api/demo/scenario", { scenario: name })

    await stepN(steps)

    const res = await call("GET", "/api/competition")

    return JSON.stringify([
      res.body.kpis,
      res.body.machines.map((m) => [m.power, m.temperature, m.state]),
    ])
  }

  const d1 = await runScenario("IDLE", 25)

  const d2 = await runScenario("IDLE", 25)

  check("Reprodutibilidade → mesmo cenário, mesmo resultado", () => {
    assert.equal(d1, d2)
  })

  await call("POST", "/api/demo/reset")

  r = await call("GET", "/api/competition")

  check("POST /api/demo/reset → volta ao estado inicial", () => {
    assert.equal(r.body.scenario, "NORMAL")

    assert.equal(r.body.step, 0)

    assert.equal(r.body.alerts.length, 0)
  })

  /* ---------------- Módulo protocolar ---------------- */

  r = await call("GET", "/api/protocols")

  check("GET /api/protocols → protocolos com SLA derivado", () => {
    assert.ok(r.body.length >= 3)

    assert.ok(
      r.body.every(
        (p) => typeof p.sla === "string" && typeof p.deadline === "string",
      ),
    )
  })

  r = await call("GET", "/api/protocols/summary")

  check("GET /api/protocols/summary → contagens por status/SLA", () => {
    assert.ok(r.body.total >= 3)

    assert.ok(typeof r.body.byStatus === "object")

    assert.ok(typeof r.body.bySla === "object")
  })

  r = await call("POST", "/api/protocols/EMS-2026-0003/advance", {})

  check("POST /api/protocols/:id/advance → avança ciclo + evento", () => {
    assert.ok(r.status === 200)

    assert.ok(r.body.events.length >= 4)
  })

  r = await call("POST", "/api/protocols", {
    title: "Teste protocolo",
    machineId: "CNC-01",
    priority: "low",
  })

  check("POST /api/protocols → cria protocolo numerado", () => {
    assert.equal(r.status, 201)

    assert.ok(/^EMS-\d{4}-\d{4}$/.test(r.body.id))

    assert.equal(r.body.status, "open")
  })

  r = await call("GET", "/api/protocols/INEXISTENTE")

  check("protocolo inexistente → 404", () => {
    assert.equal(r.status, 404)
  })

  console.log(
    `\n${passed} verificações OK${process.exitCode ? " (com falhas)" : ""}`,
  )
}

run()
