/**
 * EnergyMatrix EMS — plugin Vite.
 *
 * Expõe o backend EMS em `/api/*` dentro do próprio Vite dev/preview server,
 * de modo que o app funcione "com backend" sem precisar subir um processo Node
 * separado (útil no Figma Make, onde o Vite já está em execução).
 */

import { createApi, API_PREFIX } from "./api.mjs"

export function emsApiPlugin(options = {}) {
  const api = createApi({
    live: options.live !== false,

    tickIntervalMs: options.tickIntervalMs ?? 5000,
  })

  let started = false

  const ensureStarted = () => {
    if (!started) {
      api.start()
      started = true
    }
  }

  const readJson = (req) =>
    new Promise((resolve) => {
      if (req.method === "GET" || req.method === "HEAD") return resolve({})

      const chunks = []

      req.on("data", (c) => chunks.push(c))

      req.on("end", () => {
        if (!chunks.length) return resolve({})

        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")))
        } catch {
          resolve({})
        }
      })

      req.on("error", () => resolve({}))
    })

  const middleware = async (req, res, next) => {
    const fullUrl = req.url || ""

    const path = fullUrl.split("?")[0]

    if (!path.startsWith(API_PREFIX)) return next()

    ensureStarted()

    res.setHeader("Access-Control-Allow-Origin", "*")

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PATCH,DELETE,OPTIONS",
    )

    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    if (req.method === "OPTIONS") {
      res.statusCode = 204
      res.end()
      return
    }

    const qIdx = fullUrl.indexOf("?")

    const query =
      qIdx >= 0
        ? Object.fromEntries(
            new URLSearchParams(fullUrl.slice(qIdx + 1)).entries(),
          )
        : {}

    const body = await readJson(req)

    const result = await api.handle({ method: req.method, path, query, body })

    res.statusCode = result.status

    res.setHeader("Content-Type", "application/json; charset=utf-8")

    res.setHeader("Cache-Control", "no-store")

    res.end(
      result.body === null || result.body === undefined
        ? ""
        : JSON.stringify(result.body),
    )
  }

  return {
    name: "energymatrix-ems-api",

    configureServer(server) {
      server.middlewares.use(middleware)
    },

    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },

    closeBundle() {
      api.stop()
    },
  }
}

export default emsApiPlugin
