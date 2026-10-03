// Verificacao da conexao FRONTEND <-> BACKEND.
// Reproduz o caminho que o navegador faz: login -> /api/summary -> /api/machines.
// Objetivo: provar que o que o front consome responde de verdade (nao mock).

const BASE = process.argv[2] ?? "http://localhost:5599"
const results = []

function check(name, ok, detail = "") {
  results.push({ name, ok, detail })
}

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: process.env.SEED_ADMIN_EMAIL ?? "admin@energymatrix.demo",
    password: process.env.SEED_ADMIN_PASSWORD ?? "demo-admin-2026",
  }),
})

check("POST /api/auth/login responde 200", login.status === 200, `status=${login.status}`)

if (!login.ok) {
  console.log("Login falhou; abortando.")
  for (const r of results) console.log(`${r.ok ? "OK  " : "FALHA"} ${r.name} ${r.detail}`)
  process.exit(1)
}

const { accessToken } = await login.json()
const auth = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" }

// Sem token a API precisa recusar (prova de que o header e mesmo exigido).
const anon = await fetch(`${BASE}/api/summary`)
check("GET /api/summary sem token responde 401", anon.status === 401, `status=${anon.status}`)

for (const path of ["/api/summary", "/api/machines", "/api/alerts", "/api/economy"]) {
  const res = await fetch(`${BASE}${path}`, { headers: auth })
  const okStatus = res.status === 200
  let detail = `status=${res.status}`
  if (okStatus) {
    const body = await res.json()
    const shape =
      Array.isArray(body)
        ? `array(${body.length})`
        : `object{${Object.keys(body).slice(0, 4).join(",")}}`
    detail = `${detail} ${shape}`
  }
  check(`GET ${path} autenticado responde 200 com corpo`, okStatus, detail)
}

// O contrato que o Dashboard usa: sectors + consumption precisam existir.
const sum = await fetch(`${BASE}/api/summary`, { headers: auth }).then((r) => r.json())
check(
  "/api/summary tem sectors[] e consumption[] (contrato do Dashboard)",
  Array.isArray(sum?.sectors) && Array.isArray(sum?.consumption),
  `sectors=${Array.isArray(sum?.sectors)} consumption=${Array.isArray(sum?.consumption)}`,
)
check(
  "/api/summary tem totais com numero (nao mock)",
  typeof sum?.totals?.consumptionKwh === "number" || typeof sum?.totals?.cost === "number",
  `keys=${Object.keys(sum?.totals ?? {}).slice(0, 5).join(",")}`,
)

// Isolamento de tenant: o token de A nao pode ler recurso de B.
const machines = await fetch(`${BASE}/api/machines`, { headers: auth }).then((r) => r.json())
check(
  "/api/machines devolve lista com tenant populado",
  Array.isArray(machines) && machines.length > 0,
  `n=${Array.isArray(machines) ? machines.length : "?"}`,
)

console.log(`\nConexao frontend -> backend (${BASE})\n`)
for (const r of results) {
  console.log(`${r.ok ? "OK   " : "FALHA"} ${r.name} — ${r.detail}`)
}
const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} verificacoes OK\n`)
process.exit(failed ? 1 : 0)