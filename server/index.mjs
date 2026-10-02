/**
 * EnergyMatrix EMS — servidor HTTP standalone (Node nativo, sem dependências).
 *
 * Uso:   node server/index.mjs
 * Porta: $EMS_API_PORT (default 8787)
 * CORS:  habilitado para desenvolvimento (frontend em outra porta).
 *
 * O Vite já expõe as mesmas rotas em /api durante `vite dev` / `vite preview`
 * via server/vite-plugin.mjs, então este processo é opcional — útil para rodar
 * o backend de forma isolada (Docker, testes de integração, CI, produção).
 */

import http from "node:http"

import { createApi, API_PREFIX, API_ROUTES } from "./api.mjs"

const PORT = Number(process.env.EMS_API_PORT || process.env.PORT || 8787)

const HOST = process.env.EMS_API_HOST || "0.0.0.0"

const api = createApi({ live: process.env.EMS_LIVE !== "false" })

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*")

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")

  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
}

function send(res, status, body) {
  const payload =
    body === null || body === undefined ? "" : JSON.stringify(body)

  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" })

  res.end(payload)
}

async function readBody(req) {
  const chunks = []

  for await (const chunk of req) chunks.push(chunk)

  if (!chunks.length) return {}

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    return {}
  }
}

const server = http.createServer(async (req, res) => {
  setCors(res)

  if (req.method === "OPTIONS") {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(
    req.url || "/",
    `http://${req.headers.host || "localhost"}`,
  )

  const query = Object.fromEntries(url.searchParams.entries())

  // Índice raiz — documenta as rotas disponíveis.

  if (url.pathname === "/" || url.pathname === "/api") {
    send(res, 200, {
      service: "energymatrix-ems-api",

      version: api.store.state.version,

      routes: API_ROUTES,
    })

    return
  }

  if (!url.pathname.startsWith(API_PREFIX)) {
    send(res, 404, { error: `Not found: ${url.pathname}` })

    return
  }

  const body = ["POST", "PATCH", "PUT"].includes(req.method || "")
    ? await readBody(req)
    : {}

  const result = await api.handle({
    method: req.method,
    path: url.pathname,
    query,
    body,
  })

  send(res, result.status, result.body)
})

server.listen(PORT, HOST, () => {
  api.start()

  console.log(
    `[EMS API] EnergyMatrix EMS backend em http://localhost:${PORT}${API_PREFIX}`,
  )

  console.log(
    `[EMS API] Telemetria simulada: ${
      api.store.state.live ? "ativa (5s)" : "desativada"
    }`,
  )
})

const shutdown = () => {
  api.stop()

  server.close(() => process.exit(0))
}

process.on("SIGINT", shutdown)

process.on("SIGTERM", shutdown)
