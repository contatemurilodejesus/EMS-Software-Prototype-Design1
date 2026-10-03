/**
 * Pool PostgreSQL (Fase 2 - persistencia).
 *
 * O `pg` ja consta em `package.json`. Este modulo e o unico lugar que conhece
 * o driver: os repositories recebem o `Pool` e dependem apenas dos ports.
 *
 * Seguranca e robustez:
 *   - `statement_timeout` e `lock_timeout` evitam que uma consulta travada
 *     segure uma conexao do pool indefinidamente;
 *   - `application_name` identifica a aplicacao no `pg_stat_activity`;
 *   - a aplicacao SETA o tenant na sessao (`setTenant`) - e isso que a RLS
 *     le em `current_setting('app.tenant_id')`.
 */

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg"

export interface PoolOptions {
  connectionString: string
  max?: number
  connectionTimeoutMs?: number
  statementTimeoutMs?: number
  idleTimeoutMs?: number
  applicationName?: string
}

export interface DatabasePort {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>
  transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T>
  /** Aplica o tenant na sessao corrente (consumida pela RLS). */
  setTenant(tenantId: string | null): Promise<void>
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
  })

  // Um erro em cliente ocioso nao derruba o processo: o pool descarta e recria.
  pool.on("error", (error: Error) => {
    process.stderr.write(
      `[db] cliente ocioso com erro: ${error.message}\n`,
    )
  })

  async function setTenant(tenantId: string | null): Promise<void> {
    // `set_config` e parametrizado (seguro); `SET` nao aceitaria.bind.
    await pool.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId ?? ""])
  }

  return {
    pool,

    async query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      values: unknown[] = [],
    ): Promise<QueryResult<T>> {
      return pool.query<T>(text, values)
    },

    /**
     * Transacao real com `SET LOCAL`: o tenant vale apenas dentro dela, o que
     * impede que uma conexao do pool "vaze" o tenant para a proxima operacao.
     */
    async transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        const result = await run(client)
        await client.query("COMMIT")
        return result
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
    },

    setTenant,

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