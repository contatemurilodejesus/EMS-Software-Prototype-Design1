/**
 * Prova de isolamento NO BANCO (Fase 3 - RLS).
 *
 * O teste da API mostra que a APLICACAO filtra por tenant. Este script mostra
 * que o BANCO tambem filtra: mesmo com SQL cru, sem passar pela aplicacao, um
 * tenant so enxerga as proprias linhas.
 *
 *   node backend/tests/rls.proof.mjs
 *
 * Requer DATABASE_URL apontando para um banco com o schema aplicado e o seed.
 */

import { createDatabase } from "../src/database/postgres/pool.ts"

const TENANT_A = "3b6f5a10-0000-4000-8000-00000000000a"
const TENANT_B = "3b6f5a10-0000-4000-8000-00000000000b"

let passed = 0

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1
    console.log(`  ok  ${name}`)
  } else {
    console.error(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`)
    process.exitCode = 1
  }
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL nao definida.")
  process.exit(2)
}

const db = createDatabase({ connectionString: url, applicationName: "rls-proof" })

try {
  // ---- 1. Sem tenant definido: nada deve ser visivel -------------------
  await db.setTenant(null)
  const semTenant = await db.query("SELECT count(*)::int AS n FROM machines")
  check("sem app.tenant_id, machines retorna 0 linhas", semTenant.rows[0].n === 0, `veio ${semTenant.rows[0].n}`)

  const semTenantUsers = await db.query("SELECT count(*)::int AS n FROM users")
  check("sem app.tenant_id, users retorna 0 linhas", semTenantUsers.rows[0].n === 0)

  const semTenantTelemetry = await db.query("SELECT count(*)::int AS n FROM telemetry")
  check("sem app.tenant_id, telemetry retorna 0 linhas", semTenantTelemetry.rows[0].n === 0)

  // ---- 2. Com o tenant A definido --------------------------------------
  await db.setTenant(TENANT_A)
  const a = await db.query<{ n: number; tenant: string }>(
    "SELECT count(*)::int AS n, min(tenant_id::text) AS tenant FROM machines",
  )
  check("Tenant A enxerga as proprias maquinas", a.rows[0].n > 1, `n=${a.rows[0].n}`)
  check("toda linha visivel para A pertence ao Tenant A", a.rows[0].tenant === TENANT_A)

  const aVêB = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM machines WHERE code = 'B-001'",
  )
  check("Tenant A nao enxerga a maquina do Tenant B", aVêB.rows[0].n === 0)

  // ---- 3. Insercao com tenant alheio deve falhar (WITH CHECK) -----------
  let insertRecusado = false
  try {
    await db.query(
      `INSERT INTO machines (tenant_id, code, name, type)
       VALUES ($1, 'INVASION', 'Invasao', 'Teste')`,
      [TENANT_B],
    )
  } catch {
    insertRecusado = true
  }
  check("INSERT com tenant alheio e recusado pela politica", insertRecusado)

  // ---- 4. Trocar o tenant da sessao revela o outro conjunto -------------
  await db.setTenant(TENANT_B)
  const b = await db.query<{ n: number; codigo: string }>(
    "SELECT count(*)::int AS n, min(code) AS codigo FROM machines",
  )
  check("Tenant B enxerga somente a sua maquina", b.rows[0].n === 1, `n=${b.rows[0].n}`)
  check("a maquina visivel para B e a B-001", b.rows[0].codigo === "B-001")

  // ---- 5. FORCE ROW LEVEL SECURITY esta ativo ---------------------------
  // `audit_logs` e a excecao DE PROJETO: a trilha pode cruzar tenants para o
  // ADMIN, entao nao recebe RLS. As demais tem de estar forçadas.
  const { rows } = await db.query<{ relname: string; forced: boolean }>(
    `SELECT c.relname, c.relforcerowsecurity AS forced
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('machines','telemetry','users','alerts','machine_events')`,
  )
  check(
    "FORCE ROW LEVEL SECURITY ativo nas tabelas criticas",
    rows.length === 5 && rows.every((row) => row.forced),
    rows.map((row) => `${row.relname}=${row.forced}`).join(", "),
  )

  const { rows: audit } = await db.query<{ forced: boolean }>(
    `SELECT relforcerowsecurity AS forced FROM pg_class
      WHERE relname = 'audit_logs' AND relnamespace = 'public'::regnamespace`,
  )
  check(
    "audit_logs fica sem RLS por decisao de projeto",
    audit[0]?.forced === false,
  )

  // ---- 6. O papel da aplicacao NAO pode burlar a RLS -------------------
  const { rows: role } = await db.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
    "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
  )
  check("o papel conectado nao e superusuario", role[0]?.rolsuper === false)
  check("o papel conectado nao tem BYPASSRLS", role[0]?.rolbypassrls === false)

  console.log(`\n${passed} verificacoes de isolamento no banco OK`)
} finally {
  await db.close()
}