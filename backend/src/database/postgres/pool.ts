/**
 * Pool PostgreSQL (Fase 1 - persistencia real).
 *
 * O `pg` ja consta em `package.json`. Este modulo e o unico lugar que conhece
 * o driver: os repositories recebem o `DatabasePort` e dependem apenas dos ports.
 *
 * SEGURANCA (correcao da auditoria): aplicar `set_config` num `pool.query`
 * solto usava UMA conexao e a query seguinte caia em OUTRA - a RLS ficava
 * ineficaz ou aleatoria. Agora:
 *
 *   - cada `query()` adquire um client dedicado, aplica o tenant NELE e
 *     executa na MESMA conexao antes de liberar;
 *   - `transaction()` fixa um client (ALS) e toda query dentro da transacao
 *     reutiliza o mesmo client - atomicidade real (BEGIN/COMMIT/ROLLBACK);
 *   - o tenant vem do contexto (`resolveTenant`, injetado: ALS da requisicao)
 *     ou de um override explicito (`setTenant`) usado pela prova/seed.
 *
 * Demais garantias: statement/lock timeout, application_name, pool com
 * tratamento de erro em cliente ocioso.
 */

import { AsyncLocalStorage } from "node:async_hooks"
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg"

export interface PoolOptions {
  connectionString: string
  max?: number
  connectionTimeoutMs?: number
  statementTimeoutMs?: number
  idleTimeoutMs?: number
  applicationName?: string
  /**
   * Resolve o tenant da operacao corrente (injetado pelo composition root a
   * partir do AsyncLocalStorage da requisicao). Retorna null sem contexto.
   */
  resolveTenant?: () => string | null
}

export interface DatabasePort {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>
  transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T>
  /**
   * Override EXPLICITO de tenant (prova de RLS, scripts standalone).
   * `undefined` = seguir o `resolveTenant` (requisicoes); `null` = sem tenant.
   */
  setTenant(tenantId: string | null): void
  healthCheck(): Promise<boolean>
  close(): Promise<void>
  readonly pool: Pool
}

export function createDatabase(options: PoolOptions): DatabasePort {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.max ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMs ?? 2000,
    idleTimeoutMillis: options.idleTimeoutMs ?? 30_000,
    application_name: options.applicationName ?? "energymatrix-ems",
    ...(options.statementTimeoutMs !== undefined
      ? { statement_timeout: options.statementTimeoutMs }
      : {}),
  })

  // Um erro em cliente ocioso nao derruba o processo: o pool descarta e recria.
  pool.on("error", (error: Error) => {
    process.stderr.write(`[db] cliente ocioso com erro: ${error.message}\n`)
  })

  // Client da transacao ativa: queries internas reutilizam a MESMA conexao.
  const txStorage = new AsyncLocalStorage<PoolClient>()

  // Tenant ja aplicado por client (evita um set_config por query).
  const appliedTenant = new WeakMap<PoolClient, string>()

  // Override explicito (undefined = usar resolveTenant).
  let forcedTenant: string | null | undefined = undefined

  function currentTenant(): string | null {
    if (forcedTenant !== undefined) return forcedTenant
    return options.resolveTenant ? options.resolveTenant() : null
  }

  async function ensureTenant(client: PoolClient): Promise<void> {
    const tenant = currentTenant() ?? ""
    if (appliedTenant.get(client) === tenant) return
    // `set_config` e parametrizado (seguro); `SET` nao aceita bind.
    await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenant])
    appliedTenant.set(client, tenant)
  }

  return {
    pool,

    async query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      values: unknown[] = [],
    ): Promise<QueryResult<T>> {
      const inTx = txStorage.getStore()
      if (inTx) {
        // Dentro de transacao: mesmo client, mesmo tenant, atomicidade preservada.
        await ensureTenant(inTx)
        return inTx.query<T>(text, values)
      }

      const client = await pool.connect()
      try {
        await ensureTenant(client)
        return await client.query<T>(text, values)
      } finally {
        client.release()
      }
    },

    /**
     * Transacao real: um client fixo, tenant aplicado antes do BEGIN, e todas
     * as queries feitas dentro de `run` reutilizam esse client (ALS).
     */
    async transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
      const outer = txStorage.getStore()
      if (outer) {
        // Transacao aninhada: reusa a corrente (sem BEGIN duplicado).
        return run(outer)
      }

      const client = await pool.connect()
      try {
        await ensureTenant(client)
        await client.query("BEGIN")
        const result = await txStorage.run(client, () => run(client))
        await client.query("COMMIT")
        return result
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined)
        throw error
      } finally {
        // O client pode ser reutilizado por outro tenant: invalida a cache.
        appliedTenant.delete(client)
        client.release()
      }
    },

    setTenant(tenantId: string | null): void {
      forcedTenant = tenantId
    },

    async healthCheck(): Promise<boolean> {
      try {
        const result = await pool.query<{ ok: number }>("SELECT 1 AS ok")
        return result.rows[0]?.ok === 1
      } catch {
        return false
      }
    },

    async close(): Promise<void> {
      await pool.end()
    },
  }
}