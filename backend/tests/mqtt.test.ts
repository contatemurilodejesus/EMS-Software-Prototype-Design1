/**
 * Testes da fonte MQTT (Fase 4 - ingestao industrial real).
 *
 * O handler de mensagem e exercitado DIRETAMENTE (sem broker): valida topico,
 * payload, normalizacao para o dominio, tenant context, heartbeat de gateway,
 * contadores e o health check. O caminho com broker real (Mosquitto) cobre o
 * compose + docs/mqtt.md; a ingestao em si e a MESMA do simulador/HTTP.
 *
 *   node --test backend/tests/mqtt.test.ts
 */

import assert from "node:assert/strict"
import test from "node:test"
import {
  createMqttTelemetrySource,
  parseTelemetryMessage,
  parseTelemetryTopic,
  type MqttSourceDeps,
} from "../src/infrastructure/sources/mqtt.source.ts"
import { currentTenantIdOrNull } from "../src/shared/tenant-context.ts"
import { TENANT_A_ID, TENANT_B_ID } from "../src/database/seeds/seed-data.ts"
import type { IngestionSummary } from "../src/ingestion/ingestion.pipeline.ts"
import type { TelemetryReading } from "../src/domain/entities/index.ts"
import type { Clock, Logger } from "../src/domain/ports/index.ts"
import { buildEnvironment } from "../src/config/environment.ts"
import { createContainer } from "../src/bootstrap/container.ts"

const TOPIC_A = `energy/${TENANT_A_ID}/machines/M-001/telemetry`
const TOPIC_B = `energy/${TENANT_B_ID}/machines/M-B01/telemetry`

const clock: Clock = {
  now: () => new Date("2026-10-07T12:00:00.000Z"),
  nowMs: () => Date.parse("2026-10-07T12:00:00.000Z"),
}

/** Logger silencioso que captura os warns (assercao de rejeicoes). */
function fakeLogger(): Logger & { warnings: string[] } {
  const logger: Logger & { warnings: string[] } = {
    warnings: [],
    debug: () => undefined,
    info: () => undefined,
    warn: (message: string) => {
      logger.warnings.push(message)
    },
    error: () => undefined,
    child: () => logger,
  }
  return logger
}

function summary(persisted: number): IngestionSummary {
  return {
    received: persisted,
    persisted,
    duplicated: 0,
    unresolved: 0,
    invalid: 0,
    missing: 0,
    alertsOpened: 0,
    states: {},
  }
}

interface Capture {
  readings: TelemetryReading[]
  tenants: (string | null)[]
  heartbeats: string[]
}

/** Fonte com pipeline/heartbeat capturados (nenhuma dependencia externa). */
function makeSource(overrides: Partial<MqttSourceDeps> = {}) {
  const capture: Capture = { readings: [], tenants: [], heartbeats: [] }
  const source = createMqttTelemetrySource({
    config: {
      enabled: true,
      url: "mqtt://broker.test:1883",
      username: "",
      password: "",
      topic: "energy/+/machines/+/telemetry",
    },
    pipeline: {
      ingest: async (readings) => {
        capture.readings.push(...readings)
        capture.tenants.push(currentTenantIdOrNull())
        return summary(readings.length)
      },
    },
    gateways: {
      heartbeat: async (identifier: string) => {
        capture.heartbeats.push(identifier)
        return true
      },
    },
    clock,
    logger: fakeLogger(),
    ...overrides,
  })
  return { source, capture }
}

/* ------------------------------------------------------------------ */
/* Parsing de topico e payload                                         */
/* ------------------------------------------------------------------ */

test("topico valido extrai tenant (UUID) e maquina", () => {
  const parsed = parseTelemetryTopic(TOPIC_A)
  if (!parsed) throw new Error("topico valido foi rejeitado")
  assert.equal(parsed.tenantId, TENANT_A_ID)
  assert.equal(parsed.topicMachineId, "M-001")
})

test("topico invalido e rejeitado (prefixo, tenant nao-UUID, sufixo)", () => {
  assert.equal(parseTelemetryTopic(`energy/nao-uuid/machines/M-001/telemetry`), null)
  assert.equal(parseTelemetryTopic(`outro/${TENANT_A_ID}/machines/M-001/telemetry`), null)
  assert.equal(parseTelemetryTopic(`energy/${TENANT_A_ID}/machines/M-001`), null)
  assert.equal(parseTelemetryTopic(`energy/${TENANT_A_ID}/gateways/GW-01/telemetry`), null)
})

test("payload com alias (voltage/current/temperature) vira campos de dominio", () => {
  const parsed = parseTelemetryMessage(
    TOPIC_A,
    JSON.stringify({
      gatewayId: "GW-SP01",
      machineId: "M-001",
      timestamp: "2026-10-07T11:59:00Z",
      measurements: { powerKw: 12.4, voltage: 220, current: 18.2, temperature: 41, powerFactor: 0.92 },
    }),
    { now: clock.now() },
  )
  if (!parsed.ok) throw new Error(`rejeitado: ${parsed.reason}`)
  assert.equal(parsed.tenantId, TENANT_A_ID)
  assert.equal(parsed.gatewayId, "GW-SP01")
  assert.equal(parsed.reading.machineId, "M-001")
  assert.equal(parsed.reading.voltageV, 220)
  assert.equal(parsed.reading.currentA, 18.2)
  assert.equal(parsed.reading.temperatureC, 41)
  assert.equal(parsed.reading.powerKw, 12.4)
  assert.equal(parsed.reading.ts.toISOString(), "2026-10-07T11:59:00.000Z")
  assert.equal(parsed.reading.source, "REAL")
  assert.equal(parsed.reading.quality, "GOOD")
})

test("timestamp epoch em segundos e normalizado para milissegundos", () => {
  const parsed = parseTelemetryMessage(
    TOPIC_A,
    JSON.stringify({ timestamp: 1760000000, measurements: { powerKw: 1 } }),
    { now: clock.now() },
  )
  if (!parsed.ok) throw new Error(`rejeitado: ${parsed.reason}`)
  assert.equal(parsed.reading.ts.getTime(), 1760000000 * 1000)
})

test("mensagens invalidas sao rejeitadas sem tocar o pipeline", async () => {
  const { source, capture } = makeSource()
  const cases: { label: string; topic: string; payload: string }[] = [
    { label: "topico errado", topic: "qualquer/assunto", payload: "{}" },
    { label: "json invalido", topic: TOPIC_A, payload: "nao-e-json" },
    { label: "payload nao-objeto", topic: TOPIC_A, payload: "[1,2,3]" },
    {
      label: "timestamp invalido",
      topic: TOPIC_A,
      payload: JSON.stringify({ timestamp: "ontem", measurements: { powerKw: 1 } }),
    },
    {
      label: "medida nao numerica",
      topic: TOPIC_A,
      payload: JSON.stringify({ measurements: { powerKw: "muita" } }),
    },
  ]

  for (const item of cases) {
    const result = await source.handleMessage(item.topic, item.payload)
    assert.equal(result, null, item.label)
  }

  assert.equal(capture.readings.length, 0)
  const status = source.status()
  assert.equal(status.counters.received, cases.length)
  assert.equal(status.counters.rejected, cases.length)
  assert.equal(status.counters.accepted, 0)
})

test("mensagem valida ingerida pelo pipeline COM o tenant do topico + heartbeat", async () => {
  const { source, capture } = makeSource()
  const result = await source.handleMessage(
    TOPIC_A,
    JSON.stringify({ gatewayId: "GW-SP01", measurements: { powerKw: 3.2 } }),
  )
  if (!result) throw new Error("mensagem valida nao ingerida")

  assert.equal(result.persisted, 1)
  assert.deepEqual(capture.tenants, [TENANT_A_ID])
  assert.equal(capture.readings[0].machineId, "M-001") // vem do topico
  assert.equal(capture.readings[0].powerKw, 3.2)
  assert.deepEqual(capture.heartbeats, ["GW-SP01"])

  const status = source.status()
  assert.equal(status.counters.accepted, 1)
  assert.equal(status.counters.persisted, 1)
  assert.equal(status.lastMessageAt, "2026-10-07T12:00:00.000Z")
})

test("topico do Tenant B roda com o contexto do Tenant B (isolamento)", async () => {
  const { source, capture } = makeSource()
  const result = await source.handleMessage(TOPIC_B, JSON.stringify({ measurements: { powerKw: 1 } }))
  if (!result) throw new Error("mensagem valida nao ingerida")
  assert.deepEqual(capture.tenants, [TENANT_B_ID])
})

test("falha do pipeline vira rejected + lastError (o health reflete)", async () => {
  const { source } = makeSource({
    pipeline: {
      ingest: async () => {
        throw new Error("db down")
      },
    },
  })
  const result = await source.handleMessage(TOPIC_A, JSON.stringify({ measurements: { powerKw: 1 } }))
  assert.equal(result, null)

  const status = source.status()
  assert.equal(status.counters.rejected, 1)
  assert.match(status.lastError ?? "", /db down/)
})

test("health mqtt nunca mente: disabled sem client, unavailable com broker inacessivel", async () => {
  const base = { NODE_ENV: "test", EMS_LIVE: "false", EMS_PERSISTENCE: "memory", LOG_LEVEL: "error" }

  const off = await createContainer(buildEnvironment({ ...base, EMS_MQTT_ENABLED: "false" }))
  const offReport = await off.services.health.mqtt()
  assert.equal(offReport.status, "disabled")
  off.stop()

  const on = await createContainer(
    buildEnvironment({ ...base, EMS_MQTT_ENABLED: "true", EMS_MQTT_URL: "mqtt://127.0.0.1:1" }),
  )
  const onReport = await on.services.health.mqtt()
  assert.equal(onReport.status, "unavailable")
  on.stop()
})
