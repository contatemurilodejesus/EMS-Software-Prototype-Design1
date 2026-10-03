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
  readonly databasePoolMax: number
  readonly databaseConnectTimeoutMs: number
  readonly databaseStatementTimeoutMs: number
  readonly corsOrigin: string
  readonly bodyLimit: string
  /** Telemetria simulada ligada (store "ao vivo"). */
  readonly live: boolean
  readonly simulatorIntervalMs: number
  /** URL do frontend que consome esta API (apenas informativo no /health). */
  readonly frontendUrl: string
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
    databasePoolMax: readNumber(env, "DATABASE_POOL_MAX", 10),
    databaseConnectTimeoutMs: readNumber(env, "DATABASE_CONNECT_TIMEOUT_MS", 2000),
    databaseStatementTimeoutMs: readNumber(env, "DATABASE_STATEMENT_TIMEOUT_MS", 5000),
    corsOrigin: readString(env, "CORS_ORIGIN", "*"),
    bodyLimit: readString(env, "BODY_LIMIT", "1mb"),
    live: readBool(env, "EMS_LIVE", true),
    simulatorIntervalMs: readNumber(env, "EMS_SIMULATOR_INTERVAL_MS", 5000),
    frontendUrl: readString(env, "VITE_EMS_API_URL", ""),
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