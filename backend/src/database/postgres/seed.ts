/**
 * Seed PostgreSQL (Fase 2) - idempotente e deterministico.
 *
 * Reaproveita `database/seeds/seed-data.ts`: o cenario de demonstracao e o
 * MESMO nos dois drivers (memory e postgres). Os UUIDs de tenant/usuario sao
 * fixos; o id de maquina e gerado pelo banco e resolvido por
 * `(tenant_id, code)`, que e a chave natural.
 *
 * Nenhuma senha real no Git: as credenciais vem do ambiente e sao hasheadas
 * com scrypt no momento da execucao.
 *
 *   node backend/src/database/postgres/seed.ts
 */

import { getEnvironment, loadDotEnv } from "../../config/environment.ts"
import { hashPassword } from "../../shared/security/index.ts"
import {
  createSeedUsers,
  MACHINES,
  RELATIONSHIPS,
  SECTOR_META,
  TENANT_A_ID,
  TENANT_B_MACHINES,
  TENANTS,
  DEMO_MACHINES,
} from "../seeds/seed-data.ts"
import { createDatabase } from "./pool.ts"
import { runMigrations } from "./migrate.ts"

export interface SeedSummary {
  tenants: number
  users: number
  machines: number
  relationships: number
}

/**
 * Converte o id textual do seed (`usr-0000-0000-0000-000000000001`) em um UUID
 * valido e ESTAVEL (`00000000-0000-4000-8000-000000000001`).
 *
 * O modo memoria aceita qualquer string; o Postgres exige UUID. A conversao e
 * deterministica, entao o mesmo usuario mantem o mesmo UUID em toda execucao e
 * em qualquer ambiente.
 */
function asUuid(seedId: string): string {
  const digits = seedId.replace(/^usr-/, "").replace(/-/g, "")
  if (!/^\d+$/.test(digits)) {
    throw new Error(`Id de seed fora do formato esperado: ${seedId}`)
  }
  // O ultimo grupo do UUID tem 12 hex; os digitos finais ja sao unicos no seed.
  return `00000000-0000-4000-8000-${digits.slice(-12).padStart(12, "0")}`
}

export async function seed(
  connectionString = getEnvironment().databaseUrl,
): Promise<SeedSummary> {
  const db = createDatabase({ connectionString, applicationName: "energymatrix-seed" })

  try {
    // O seed presume o schema pronto; aplica o que faltar.
    await runMigrations(connectionString)

    // A RLS esconde tudo sem `app.tenant_id`. O seed e um JOB de manutencao:
    // ele desliga a RLS explicitamente, neste escopo e nesta transacao.
    await db.query("SET row_security = off")

    const summary: SeedSummary = { tenants: 0, users: 0, machines: 0, relationships: 0 }

    // ---- Tenants ------------------------------------------------------
    for (const tenant of TENANTS) {
      await db.query(
        `INSERT INTO tenants (id, name, slug, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name, slug = EXCLUDED.slug,
               status = EXCLUDED.status, updated_at = now()`,
        [tenant.id, tenant.name, tenant.slug, tenant.status],
      )
      summary.tenants += 1
    }

    // ---- Setores ------------------------------------------------------
    for (const sector of SECTOR_META) {
      await db.query(
        `INSERT INTO sectors (tenant_id, name) VALUES ($1, $2)
         ON CONFLICT (tenant_id, name) DO UPDATE SET name = EXCLUDED.name`,
        [TENANT_A_ID, sector.name],
      )
    }

    // ---- Usuarios (senha hasheada agora; nunca no Git) -----------------
    const env = getEnvironment()
    const users = createSeedUsers({
      adminEmail: env.seedAdminEmail,
      adminPassword: env.seedAdminPassword,
      accountingEmail: env.seedAccountingEmail,
      accountingPassword: env.seedAccountingPassword,
      evaluatorEmail: env.seedEvaluatorEmail,
      evaluatorPassword: env.seedEvaluatorPassword,
      tenantBEmail: env.seedTenantBEmail,
      tenantBPassword: env.seedTenantBPassword,
    })

    for (const user of users) {
      await db.query(
        `INSERT INTO users (id, tenant_id, name, email, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name, email = EXCLUDED.email,
               password_hash = EXCLUDED.password_hash, role = EXCLUDED.role,
               status = EXCLUDED.status, updated_at = now()`,
        [
          asUuid(user.id),
          user.tenantId,
          user.name,
          user.email,
          hashPassword(user.passwordHash),
          user.role,
          user.status,
        ],
      )
      summary.users += 1
    }

    // ---- Maquinas -----------------------------------------------------
    const machines = [
      ...MACHINES.map((m) => ({ ...m, tenantId: TENANT_A_ID })),
      ...DEMO_MACHINES,
      ...TENANT_B_MACHINES,
    ]

    for (const machine of machines) {
      await db.query(
        `INSERT INTO machines
           (tenant_id, code, name, type, status, nominal_power_kw,
            p_off_kw, p_run_kw, baseline_kw)
         VALUES ($1, $2, $3, $4, 'STOPPED', $5, $6, $7, $8)
         ON CONFLICT (tenant_id, code) DO UPDATE
           SET name = EXCLUDED.name, type = EXCLUDED.type,
               nominal_power_kw = EXCLUDED.nominal_power_kw,
               p_off_kw = EXCLUDED.p_off_kw, p_run_kw = EXCLUDED.p_run_kw,
               baseline_kw = EXCLUDED.baseline_kw, updated_at = now()`,
        [
          machine.tenantId,
          machine.id,
          machine.name,
          machine.type,
          machine.nominalKW,
          machine.pOff,
          machine.pRun,
          machine.baselineKw ?? null,
        ],
      )
      summary.machines += 1
    }

    // ---- Relacoes (M-001 -> M-002 -> M-003) ---------------------------
    const { rows } = await db.query<{ id: string; code: string }>(
      "SELECT id::text AS id, code FROM machines",
    )
    const byCode = new Map(rows.map((row) => [row.code, row.id]))

    for (const rel of RELATIONSHIPS) {
      const source = byCode.get(rel.sourceMachineId)
      const target = byCode.get(rel.targetMachineId)
      if (!source || !target) continue

      await db.query(
        `INSERT INTO machine_relationships
           (tenant_id, source_machine_id, target_machine_id,
            relationship_type, dependency_level, active)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, source_machine_id, target_machine_id, relationship_type)
           DO UPDATE SET active = EXCLUDED.active, updated_at = now()`,
        [rel.tenantId, source, target, rel.relationshipType, rel.dependencyLevel, rel.active],
      )
      summary.relationships += 1
    }

    return summary
  } finally {
    await db.close()
  }
}

// Execucao direta (`npm run seed`).
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  loadDotEnv()
  seed()
    .then((summary) => {
      process.stdout.write(
        `seed ok: ${summary.tenants} tenant(s), ${summary.users} usuario(s), ` +
          `${summary.machines} maquina(s), ${summary.relationships} relacao(oes)\n`,
      )
      process.exit(0)
    })
    .catch((error: unknown) => {
      process.stderr.write(`Falha no seed: ${String(error)}\n`)
      process.exit(1)
    })
}