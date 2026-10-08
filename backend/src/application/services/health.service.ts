/**
 * Application service - SAUDE da API.
 *
 * O payload preserva o contrato atual do frontend (status/service/version/
 * uptimeSeconds/live) e acrescenta os campos usados pelos health checks
 * (liveness e readiness, este ultimo com o estado do banco).
 */

export interface HealthRuntime {
  version: string
  serviceName: string
  live: boolean
  startedAt: Date
  ticks: () => number
  lastTickAt: () => Date
}

export interface HealthDependencies {
  machinesCount: () => Promise<number>
  alertsOpen: () => Promise<number>
  databaseReady: () => Promise<boolean>
  persistence: string
  /**
   * Estado real do client MQTT (Fase 4). Ausente = broker nao configurado
   * no container; presente devolve disabled|ok|unavailable com contadores.
   */
  mqttHealth?: () => MqttHealthReport
}

export interface MqttHealthReport {
  status: string
  note?: string
  broker?: string
  topic?: string
  lastMessageAt?: string | null
  counters?: Record<string, number>
}

export function createHealthService(runtime: HealthRuntime, deps: HealthDependencies) {
  async function health() {
    const now = runtime.lastTickAt()
    return {
      status: "ok",
      service: runtime.serviceName,
      version: runtime.version,
      uptimeSeconds: Math.round((Date.now() - runtime.startedAt.getTime()) / 1000),
      live: runtime.live,
      tickCount: runtime.ticks(),
      lastTickAt: `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      machines: await deps.machinesCount(),
      alertsOpen: await deps.alertsOpen(),
    }
  }

  /** Liveness: o processo esta de pe (nao consulta dependencias). */
  function live() {
    return { status: "ok", service: runtime.serviceName, version: runtime.version }
  }

  /** Readiness: aplicacao + banco disponiveis. */
  async function ready() {
    const database = await deps.databaseReady()
    return {
      status: database ? "ready" : "degraded",
      service: runtime.serviceName,
      version: runtime.version,
      persistence: deps.persistence,
      checks: { application: "ok", database: database ? "ok" : "unavailable" },
    }
  }

  async function database(): Promise<{ status: string }> {
    return { status: (await deps.databaseReady()) ? "ok" : "unavailable" }
  }

  /**
   * Health MQTT (Fase 4): estado REAL do client - `disabled` quando
   * `EMS_MQTT_ENABLED=false`, `ok` conectado, `unavailable` desconectado.
   * Nunca retorna "healthy" para broker inacessivel (secao 28).
   */
  function mqtt(): MqttHealthReport {
    return deps.mqttHealth?.() ?? { status: "unknown", note: "broker MQTT nao configurado" }
  }

  return { health, live, ready, database, mqtt }
}

export type HealthService = ReturnType<typeof createHealthService>