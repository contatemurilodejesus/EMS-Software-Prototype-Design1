/**
 * EnergyMatrix EMS - configuracao do backend.
 *
 * UNICO ponto de leitura de `process.env` no backend (regra arquitetural
 * verificada em `backend/tests/architecture.test.ts`). Nenhuma credencial
 * fica no codigo: tudo vem do ambiente ou do arquivo `.env`.
 */

export type LogLevel = "debug" | "info" | "warn" | "error"

/** Driver de persistencia dos ports. `memory` e o fallback da demonstracao. */
export type PersistenceDriver = "memory" | "postgres"

export type NodeEnv = "development" | "test" | "production"

export interface Environment {
  readonly nodeEnv: NodeEnv
  readonly isProduction: boolean
  readonly serviceName: string
  readonly version: string
  readonly host: string
  readonly port: number
  readonly apiPrefix: string
  readonly logLevel: LogLevel
  readonly persistence: PersistenceDriver
  readonly databaseUrl: string
  /** URL de ADMINISTRACAO (migrations/seed). Padrao = DATABASE_URL. */
  readonly databaseAdminUrl: string
  readonly databasePoolMax: number
  readonly databaseConnectTimeoutMs: number
  readonly databaseStatementTimeoutMs: number
  readonly corsOrigin: string
  readonly bodyLimit: string
  /** Rate limiting por categoria (secao 11.1): maximo de requisicoes/janela. */
  readonly rateLimitAuthMax: number
  readonly rateLimitApiMax: number
  readonly rateLimitTelemetryMax: number
  readonly rateLimitAdminMax: number
  /** Telemetria simulada ligada (store "ao vivo"). */
  readonly live: boolean
  readonly simulatorIntervalMs: number
  /** URL do frontend que consome esta API (apenas informativo no /health). */
  readonly frontendUrl: string
  /** MQTT (Fase 4): ingestao de telemetria de gateways industriais. */
  readonly mqttEnabled: boolean
  readonly mqttUrl: string
  readonly mqttUsername: string
  readonly mqttPassword: string
  /** Padrão de subscribe (wildcards MQTT). */
  readonly mqttTopic: string
  /** Auth (secao 7/15): segredos e expiracoes (P3/P4). */
  readonly jwtAccessSecret: string
  readonly jwtRefreshSecret: string
  readonly jwtAccessTtlMinutes: number
  readonly jwtRefreshTtlDays: number
  readonly inviteTtlHours: number
  /** Endpoints de demo (/api/demo/*) habilitados (D20). */
  readonly demoMode: boolean
  /** Limite de ausencia (min) para OFFLINE (P2 / D9). */
  readonly offlineTimeoutMinutes: number
  /** Janela minima (min) de IDLE a jusante para analise de impacto (P1 / D2). */
  readonly impactMinWindowMinutes: number
  /** Janelas "antes" e "depois" (horas) da comparacao (P5 e P6). */
  readonly beforeWindowHours: number
  readonly afterWindowHours: number
  /** Credenciais do ADMIN de demonstracao - apenas no seed (secao 15). */
  readonly seedAdminEmail: string
  readonly seedAdminPassword: string
  readonly seedAccountingEmail: string
  readonly seedAccountingPassword: string
  readonly seedEvaluatorEmail: string
  readonly seedEvaluatorPassword: string
  /** Tenant B do teste de isolamento (seed). */
  readonly seedTenantBEmail: string
  readonly seedTenantBPassword: string
}

const DEFAULT_DATABASE_URL =
  "postgres://energymatrix:energymatrix@localhost:5432/energymatrix"

const LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"]

function readString(env: Record<string, string | undefined>, key: string, fallback: string): string {
  const raw = env[key]
  return raw === undefined || raw === "" ? fallback : raw
}

function readNumber(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const raw = env[key]
  if (raw === undefined || raw === "") return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readBool(env: Record<string, string | undefined>, key: string, fallback: boolean): boolean {
  const raw = env[key]
  if (raw === undefined || raw === "") return fallback
  return ["1", "true", "yes", "on", "sim"].includes(raw.trim().toLowerCase())
}

function readEnum<T extends string>(
  env: Record<string, string | undefined>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = env[key]?.trim().toLowerCase()
  return allowed.includes(raw as T) ? (raw as T) : fallback
}

/** Construtor puro: recebe o ambiente como dado (tests injetam um objeto). */
export function buildEnvironment(env: Record<string, string | undefined> = {}): Environment {
  const nodeEnv = readEnum<NodeEnv>(env, "NODE_ENV", ["development", "test", "production"], "development")
  const persistence = readEnum<PersistenceDriver>(env, "EMS_PERSISTENCE", ["memory", "postgres"], "memory")
  const databaseUrl = readString(env, "DATABASE_URL", DEFAULT_DATABASE_URL)

  return {
    nodeEnv,
    isProduction: nodeEnv === "production",
    serviceName: readString(env, "EMS_SERVICE_NAME", "energymatrix-ems-api"),
    version: readString(env, "EMS_VERSION", "2.0.0"),
    host: readString(env, "EMS_API_HOST", "0.0.0.0"),
    port: readNumber(env, "EMS_API_PORT", 8787),
    apiPrefix: readString(env, "API_PREFIX", "/api"),
    logLevel: readEnum<LogLevel>(env, "LOG_LEVEL", LEVELS, "info"),
    persistence,
    databaseUrl,
    // Migrations/seed usam o papel de ADMINISTRACAO (superuser, necessario
    // para criar schema/politicas); o backend usa o papel comum energymatrix_app.
    // Sem DATABASE_ADMIN_URL (dev local), os dois caminhos sao o mesmo usuario.
    databaseAdminUrl: readString(env, "DATABASE_ADMIN_URL", databaseUrl),
    databasePoolMax: readNumber(env, "DATABASE_POOL_MAX", 10),
    databaseConnectTimeoutMs: readNumber(env, "DATABASE_CONNECT_TIMEOUT_MS", 2000),
    databaseStatementTimeoutMs: readNumber(env, "DATABASE_STATEMENT_TIMEOUT_MS", 5000),
    corsOrigin: readString(env, "CORS_ORIGIN", "*"),
    bodyLimit: readString(env, "BODY_LIMIT", "1mb"),
    // Rate limiting categorizado (secao 11.1): autenticacao, API geral,
    // ingestao de telemetria e operacoes administrativas.
    rateLimitAuthMax: readNumber(env, "EMS_RATE_LIMIT_AUTH_MAX", 10),
    rateLimitApiMax: readNumber(env, "EMS_RATE_LIMIT_API_MAX", 300),
    rateLimitTelemetryMax: readNumber(env, "EMS_RATE_LIMIT_TELEMETRY_MAX", 120),
    rateLimitAdminMax: readNumber(env, "EMS_RATE_LIMIT_ADMIN_MAX", 120),
    live: readBool(env, "EMS_LIVE", true),
    simulatorIntervalMs: readNumber(env, "EMS_SIMULATOR_INTERVAL_MS", 5000),
    frontendUrl: readString(env, "VITE_EMS_API_URL", ""),
    // MQTT: opt-in (default desligado - dev sem broker nao pode quebrar).
    mqttEnabled: readBool(env, "EMS_MQTT_ENABLED", false),
    mqttUrl: readString(env, "EMS_MQTT_URL", "mqtt://localhost:1883"),
    mqttUsername: readString(env, "EMS_MQTT_USERNAME", ""),
    mqttPassword: readString(env, "EMS_MQTT_PASSWORD", ""),
    mqttTopic: readString(env, "EMS_MQTT_TOPIC", "energy/+/machines/+/telemetry"),
    // Segredos: em producao SEM fallback (falha na partida); dev/demo usa default local.
    jwtAccessSecret: readString(
      env,
      "JWT_ACCESS_SECRET",
      nodeEnv === "production" ? "" : "energymatrix-dev-access-secret",
    ),
    jwtRefreshSecret: readString(
      env,
      "JWT_REFRESH_SECRET",
      nodeEnv === "production" ? "" : "energymatrix-dev-refresh-secret",
    ),
    jwtAccessTtlMinutes: readNumber(env, "JWT_ACCESS_TTL_MIN", 15),
    jwtRefreshTtlDays: readNumber(env, "JWT_REFRESH_TTL_DAYS", 7),
    inviteTtlHours: readNumber(env, "INVITE_TTL_HOURS", 72),
    demoMode: readBool(env, "DEMO_MODE", true),
    offlineTimeoutMinutes: readNumber(env, "OFFLINE_TIMEOUT_MIN", 5),
    impactMinWindowMinutes: readNumber(env, "IMPACT_MIN_WINDOW_MIN", 10),
    beforeWindowHours: readNumber(env, "BEFORE_WINDOW_HOURS", 24),
    afterWindowHours: readNumber(env, "AFTER_WINDOW_HOURS", 24),
    seedAdminEmail: readString(env, "SEED_ADMIN_EMAIL", "admin@energymatrix.demo"),
    seedAdminPassword: readString(env, "SEED_ADMIN_PASSWORD", "demo-admin-2026"),
    seedAccountingEmail: readString(env, "SEED_ACCOUNTING_EMAIL", "financeiro@energymatrix.demo"),
    seedAccountingPassword: readString(env, "SEED_ACCOUNTING_PASSWORD", "demo-contabil-2026"),
    seedEvaluatorEmail: readString(env, "SEED_EVALUATOR_EMAIL", "avaliador@energymatrix.demo"),
    seedEvaluatorPassword: readString(env, "SEED_EVALUATOR_PASSWORD", "demo-avaliador-2026"),
    seedTenantBEmail: readString(env, "SEED_TENANT_B_EMAIL", "admin@empresa-b.demo"),
    seedTenantBPassword: readString(env, "SEED_TENANT_B_PASSWORD", "demo-empresa-b-2026"),
  }
}

/**
 * Carrega `.env` (se existir) sem dependencia externa: `process.loadEnvFile`
 * do Node 20.12+ le e injeta as variaveis. Falha silenciosa quando ausente.
 */
export function loadDotEnv(path = ".env"): boolean {
  const loader = (process as { loadEnvFile?: (p?: string) => void }).loadEnvFile
  if (typeof loader !== "function") return false
  try {
    loader.call(process, path)
    return true
  } catch {
    return false
  }
}

let cached: Environment | null = null

/** Leitura memoizada (padrao do processo). */
export function getEnvironment(): Environment {
  if (!cached) cached = buildEnvironment(process.env)
  return cached
}

/** Invalida o cache (usado apenas por testes/bootstrap). */
export function resetEnvironmentCache(): void {
  cached = null
}