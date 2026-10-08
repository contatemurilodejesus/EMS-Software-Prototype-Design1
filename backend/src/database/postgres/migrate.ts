/**
 * Runner de migrations (Fase 2).
 *
 * Cada arquivo `NNN_nome.sql` e aplicado em ordem lexicografica, uma unica
 * vez, dentro de uma transacao propria, e registrado em `schema_migrations`.
 * O lock deoadvisory evita que dois processos subindo ao mesmo tempo (backend
 * + `npm run setup`, por exemplo) apliquem a mesma migration duas vezes.
 *
 *   node backend/src/database/postgres/migrate.ts
 */

import { readFileSync, readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { getEnvironment, loadDotEnv } from "../../config/environment.ts"
import { createDatabase } from "./pool.ts"

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations")

/** Lock global: impede applies concorrentes (409 se outro processo detem). */
const ADVISORY_LOCK = 918_273_645

export interface MigrationResult {
  applied: string[]
  skipped: string[]
}

function listMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
}

async function ensureRegistry(db: ReturnType<typeof createDatabase>): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

export async function runMigrations(
  // ADMIN: criar schema/politicas exige o papel de administracao
  // (DATABASE_ADMIN_URL); o backend roda com o papel comum.
  connectionString = getEnvironment().databaseAdminUrl,
): Promise<MigrationResult> {
  const db = createDatabase({
    connectionString,
    applicationName: "energymatrix-migrate",
  })

  const result: MigrationResult = { applied: [], skipped: [] }

  try {
    // Espera o banco ficar disponivel (compose demora alguns segundos).
    const deadline = Date.now() + 30_000
    while (!(await db.healthCheck())) {
      if (Date.now() > deadline) {
        throw new Error("Banco indisponivel apos 30s: verifique DATABASE_URL")
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    await ensureRegistry(db)

    const { rows: done } = await db.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations",
    )
    const applied = new Set(done.map((row) => row.filename))

    for (const file of listMigrations()) {
      if (applied.has(file)) {
        result.skipped.push(file)
        continue
      }

      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8")

      try {
        await db.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK])
        await db.transaction(async (client) => {
          await client.query(sql)
          await client.query(
            "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
            [file],
          )
        })
      } finally {
        await db.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK]).catch(() => undefined)
      }

      result.applied.push(file)
      process.stdout.write(`migration aplicada: ${file}\n`)
    }

    return result
  } finally {
    await db.close()
  }
}

// Execucao direta (`npm run migrate`).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  loadDotEnv()
  runMigrations()
    .then((result) => {
      process.stdout.write(
        `\n${result.applied.length} aplicada(s), ${result.skipped.length} ja existente(s)\n`,
      )
      process.exit(0)
    })
    .catch((error: unknown) => {
      process.stderr.write(`Falha nas migrations: ${String(error)}\n`)
      process.exit(1)
    })
}