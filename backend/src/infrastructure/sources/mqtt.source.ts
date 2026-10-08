/**
 * FONTE DE TELEMETRIA MQTT (Fase 4 - ingestao industrial real).
 *
 * Conecta no broker (Mosquitto), assina `energy/{tenant}/machines/{id}/telemetry`
 * e entrega os payloads ao MESMO `IngestionPipeline` do simulador e da API HTTP:
 * validar -> resolver maquina -> deduplicar -> persistir -> analytics ->
 * alertas. Nao existe caminho paralelo de ingestao (D19).
 *
 * Contrato da mensagem (JSON, secao 10 - respeita o dominio existente):
 *   {
 *     "gatewayId": "GW-SP01",
 *     "machineId": "M-001",
 *     "timestamp": "2026-10-07T12:00:00Z",
 *     "measurements": { "powerKw": 12.4, "voltage": 220, "current": 18.2,
 *                       "temperature": 41, "powerFactor": 0.92 }
 *   }
 * `measurements` aceita tambem os nomes de dominio (voltageV, currentA,
 * temperatureC, energyKwh). Campo numerico ausente = ausencia (null);
 * valor presente e invalido = mensagem REJEITADA (nunca "consertada").
 *
 * Multi-tenancy (secao 7.1): o tenant vem do TOPICO, protegido pelo ACL por
 * credencial de gateway no broker; a defesa em profundidade e o proprio banco
 * - a leitura roda sob `runWithActor` e a RLS + filtro por tenant do
 * repository impedem escrita fora do proprio tenant.
 */

import { connect, type MqttClient } from "mqtt"
import { z } from "zod"
import { runWithActor } from "../../shared/tenant-context.ts"
import type { TelemetryReading } from "../../domain/entities/index.ts"
import type { Clock, IGatewayRepository, Logger } from "../../domain/ports/index.ts"
import type { IngestionSummary } from "../../ingestion/ingestion.pipeline.ts"

export interface MqttSourceConfig {
  enabled: boolean
  url: string
  username: string
  password: string
  /** Padrao de subscribe (wildcards MQTT). */
  topic: string
}

export interface MqttSourceDeps {
  config: MqttSourceConfig
  /** MESMO pipeline do simulador/HTTP - sem caminho paralelo. */
  pipeline: { ingest(readings: TelemetryReading[]): Promise<IngestionSummary> }
  /** Heartbeat em `gateways.last_seen_at` (secao 11). Opcional. */
  gateways?: IGatewayRepository
  clock: Clock
  logger: Logger
}

/** Contadores expostos em GET /health/mqtt. */
export type MqttCounters = {
  received: number
  accepted: number
  rejected: number
  duplicated: number
  persisted: number
  unresolved: number
  invalid: number
}

export interface MqttStatus {
  enabled: boolean
  connected: boolean
  broker: string
  topic: string
  lastMessageAt: string | null
  counters: MqttCounters
  lastError: string | null
}

/* ------------------------------------------------------------------ */
/* Parsing (exportado para testes sem broker)                          */
/* ------------------------------------------------------------------ */

const TELEMETRY_TOPIC_RE =
  /^energy\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/machines\/([^/]+)\/telemetry$/i

export interface TelemetryTopic {
  tenantId: string
  topicMachineId: string
}

/** Topico invalido (prefixo, tenant ou sufixo errados) -> null. */
export function parseTelemetryTopic(topic: string): TelemetryTopic | null {
  const match = TELEMETRY_TOPIC_RE.exec(topic)
  if (!match) return null
  let machine: string
  try {
    machine = decodeURIComponent(match[2])
  } catch {
    return null
  }
  return { tenantId: match[1].toLowerCase(), topicMachineId: machine }
}

const NUMERIC_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/

/** Numerico: number finito ou string numerica. `null`/bool/sujeira = rejeita. */
const numeric = z
  .union([
    z.number().refine(Number.isFinite, { message: "numero finito esperado" }),
    z.string().regex(NUMERIC_RE, { message: "numero esperado" }),
  ])
  .transform((value) => (typeof value === "number" ? value : Number(value)))

const measurementsSchema = z.object({
  powerKw: numeric.optional(),
  energyKwh: numeric.optional(),
  // Alias curto (contrato de gateway) e nome de dominio.
  voltage: numeric.optional(),
  voltageV: numeric.optional(),
  current: numeric.optional(),
  currentA: numeric.optional(),
  powerFactor: numeric.optional(),
  temperature: numeric.optional(),
  temperatureC: numeric.optional(),
})

const payloadSchema = z.object({
  gatewayId: z.string().min(1).max(64).optional(),
  machineId: z.string().min(1).max(64).optional(),
  timestamp: z.union([z.string(), z.number()]).optional(),
  measurements: measurementsSchema.default({}),
})

export type ParsedTelemetryMessage =
  | { ok: true; tenantId: string; gatewayId: string | null; reading: TelemetryReading }
  | { ok: false; reason: string }

export interface ParseOptions {
  /** Relogio para mensagens sem timestamp (default: tempo real). */
  now?: Date
}

/** Epoch em segundos (tipico industrial) ou milissegundos -> ms. */
function normalizeTimestamp(raw: string | number | undefined, fallback: Date): number | null {
  if (raw === undefined) return fallback.getTime()
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw <= 0) return null
    return raw < 1e12 ? Math.round(raw * 1000) : raw
  }
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * Valida topico + payload e normaliza para o contrato de `TelemetryReading`.
 * Motivos de rejeicao sao estaveis (testaveis): topic_invalido, json_invalido,
 * schema_invalido, machine_ausente, timestamp_invalido.
 */
export function parseTelemetryMessage(
  topic: string,
  payload: Buffer | string,
  options: ParseOptions = {},
): ParsedTelemetryMessage {
  const parsedTopic = parseTelemetryTopic(topic)
  if (!parsedTopic) return { ok: false, reason: "topic_invalido" }

  const raw = typeof payload === "string" ? payload : payload.toString("utf8")
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, reason: "json_invalido" }
  }

  const result = payloadSchema.safeParse(json)
  if (!result.success) {
    const paths = result.error.issues.map((issue) => issue.path.join(".") || "payload").join(",")
    return { ok: false, reason: `schema_invalido:${paths}` }
  }

  const body = result.data
  const machineId = body.machineId ?? parsedTopic.topicMachineId
  if (!machineId) return { ok: false, reason: "machine_ausente" }

  const tsMs = normalizeTimestamp(body.timestamp, options.now ?? new Date())
  if (tsMs === null) return { ok: false, reason: "timestamp_invalido" }

  const m = body.measurements
  return {
    ok: true,
    tenantId: parsedTopic.tenantId,
    gatewayId: body.gatewayId ?? null,
    reading: {
      machineId,
      ts: new Date(tsMs),
      powerKw: m.powerKw ?? 0,
      energyKwh: m.energyKwh ?? null,
      voltageV: m.voltageV ?? m.voltage ?? null,
      currentA: m.currentA ?? m.current ?? null,
      powerFactor: m.powerFactor ?? null,
      temperatureC: m.temperatureC ?? m.temperature ?? null,
      // `state` e DERIVADO pelo State Engine na ingestao (contrato da API).
      state: "RUNNING",
      quality: "GOOD",
      source: "REAL",
      sensorId: null,
    },
  }
}

/* ------------------------------------------------------------------ */
/* Fonte (client MQTT com reconexao)                                   */
/* ------------------------------------------------------------------ */

export function createMqttTelemetrySource(deps: MqttSourceDeps) {
  const log = deps.logger.child({ layer: "mqtt" })
  const counters: MqttCounters = {
    received: 0,
    accepted: 0,
    rejected: 0,
    duplicated: 0,
    persisted: 0,
    unresolved: 0,
    invalid: 0,
  }

  let client: MqttClient | null = null
  let connected = false
  let lastMessageAt: string | null = null
  let lastError: string | null = null

  function status(): MqttStatus {
    return {
      enabled: deps.config.enabled,
      connected,
      broker: deps.config.url,
      topic: deps.config.topic,
      lastMessageAt,
      counters: { ...counters },
      lastError,
    }
  }

  /**
   * Handler unico de mensagem - exposto tambem para testes sem broker.
   * Retorna o summary do pipeline ou null quando rejeitada.
   */
  async function handleMessage(topic: string, payload: Buffer | string): Promise<IngestionSummary | null> {
    counters.received += 1
    lastMessageAt = deps.clock.now().toISOString()

    const parsed = parseTelemetryMessage(topic, payload, { now: deps.clock.now() })
    if (!parsed.ok) {
      counters.rejected += 1
      log.warn("Mensagem MQTT rejeitada", { topic, reason: parsed.reason })
      return null
    }

    const { tenantId, gatewayId, reading } = parsed

    try {
      const summary = await runWithActor(
        { tenantId, userId: gatewayId ? `mqtt:${gatewayId}` : "mqtt:gateway", role: "ADMIN" },
        async () => {
          const result = await deps.pipeline.ingest([reading])
          if (deps.gateways && gatewayId) {
            // Heartbeat best-effort: falha aqui nao invalida a leitura ja gravada.
            try {
              await deps.gateways.heartbeat(gatewayId, deps.clock.now())
            } catch (error) {
              log.warn("Heartbeat de gateway falhou", { gatewayId, error: String(error) })
            }
          }
          return result
        },
      )

      counters.accepted += 1
      counters.duplicated += summary.duplicated
      counters.persisted += summary.persisted
      counters.unresolved += summary.unresolved
      counters.invalid += summary.invalid
      log.info("Leitura MQTT ingerida", {
        tenantId,
        machineId: reading.machineId,
        persisted: summary.persisted,
        duplicated: summary.duplicated,
        unresolved: summary.unresolved,
      })
      return summary
    } catch (error) {
      counters.rejected += 1
      lastError = String(error)
      log.error("Falha ao ingerir mensagem MQTT", { topic, error: String(error) })
      return null
    }
  }

  /** Conecta no broker e assina o topico com QoS 1 (ao menos uma vez). */
  function start(): void {
    if (!deps.config.enabled || client) return

    client = connect(deps.config.url, {
      clientId: `energymatrix-ems-${process.pid}`,
      username: deps.config.username || undefined,
      password: deps.config.password || undefined,
      reconnectPeriod: 5_000,
      connectTimeout: 10_000,
      clean: true,
    })

    client.on("connect", () => {
      connected = true
      lastError = null
      log.info("Conectado ao broker MQTT", { broker: deps.config.url })
      client?.subscribe(deps.config.topic, { qos: 1 }, (error) => {
        if (error) {
          lastError = String(error)
          log.error("Falha ao assinar topico MQTT", { topic: deps.config.topic, error: String(error) })
        } else {
          log.info("Topico MQTT assinado", { topic: deps.config.topic, qos: 1 })
        }
      })
    })

    client.on("message", (topic, payload) => {
      void handleMessage(topic, payload)
    })

    client.on("error", (error) => {
      lastError = String(error)
      log.error("Erro do client MQTT", { error: String(error) })
    })

    client.on("reconnect", () => {
      log.debug("Reconectando ao broker MQTT", { broker: deps.config.url })
    })

    client.on("offline", () => {
      connected = false
      log.warn("Client MQTT offline - aguardando reconexao", { broker: deps.config.url })
    })

    client.on("close", () => {
      connected = false
    })
  }

  function stop(): void {
    if (!client) return
    const closing = client
    client = null
    connected = false
    closing.end(true)
    log.info("Client MQTT encerrado", { broker: deps.config.url })
  }

  return { start, stop, status, handleMessage }
}

export type MqttTelemetrySource = ReturnType<typeof createMqttTelemetrySource>
