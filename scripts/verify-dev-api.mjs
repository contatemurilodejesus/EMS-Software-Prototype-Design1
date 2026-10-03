/**
 * Verificacao de fumaca do `npm run dev`: o Vite expoe a API OFICIAL (Express)
 * com autenticacao, RBAC e isolamento entre tenants.
 *
 *   node scripts/verify-dev-api.mjs
 *
 * Nao substitui os testes automatizados (`npm test`): serve para provar, no
 * servidor de desenvolvimento, que o caminho oficial esta no ar.
 */

const BASE = process.argv[2] ?? "http://localhost:5599"

const ADMIN_A = ["admin@energymatrix.demo", "demo-admin-2026"]
const ADMIN_B = ["admin@empresa-b.demo", "demo-empresa-b-2026"]

let passed = 0

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1
    console.log(`  ok  ${name}`)
    return
  }
  console.error(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`)
  process.exitCode = 1
}

async function login([email, password]) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  return { status: response.status, body: await response.json() }
}

async function get(path, token) {
  const response = await fetch(`${BASE}/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}

console.log(`EnergyMatrix EMS - verificacao do dev server (${BASE})\n`)

const semToken = await get("/machines")
check("rota protegida responde 401 sem token", semToken.status === 401, `veio ${semToken.status}`)

const loginA = await login(ADMIN_A)
check("login do Tenant A devolve access token", loginA.status === 200 && Boolean(loginA.body.accessToken))

const loginB = await login(ADMIN_B)
check("login do Tenant B devolve access token", loginB.status === 200 && Boolean(loginB.body.accessToken))

const tokenA = loginA.body.accessToken
const tokenB = loginB.body.accessToken

const maquinasA = await get("/machines", tokenA)
const maquinasB = await get("/machines", tokenB)
check("Tenant A ve as suas maquinas", maquinasA.status === 200 && maquinasA.body.length > 1)
check("Tenant B ve somente a sua maquina", maquinasB.status === 200 && maquinasB.body.length === 1)

const idB = maquinasB.body[0]?.id
const cruzado = await get(`/machines/${idB}`, tokenA)
check("Tenant A recebe 404 ao acessar recurso do Tenant B", cruzado.status === 404, `veio ${cruzado.status}`)

const relacoes = await get("/relationships", tokenA)
check("relacoes entre maquinas vem da API", relacoes.status === 200 && relacoes.body.length > 0)

const network = await get("/machines/network", tokenA)
check("Machine Network devolve o grafo", network.status === 200 && network.body.edges.length > 0)

const eventos = await get("/events?limit=5", tokenA)
check("eventos de maquina respondem", eventos.status === 200)

console.log(`\n${passed} verificacoes OK`)