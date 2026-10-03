/**
 * EnergyMatrix EMS - plugin Vite: a API OFICIAL (Express) em `/api/*`.
 *
 * Este plugin NAO contem regra de negocio. Ele apenas:
 *   1. monta o composition root (`createContainer`) e a aplicacao Express;
 *   2. encaminha as requisicoes de `/api` ao Express por um socket local
 *      efemero (sem porta exposta, sem duplicar nenhuma rota).
 *
 * Consequencia arquitetural (mandate 4): existe UM backend apenas. O legado
 * `server/*.mjs` foi removido - nao ha mais duas implementacoes concorrentes.
 *
 * O `backend/src/server/server.ts` continua sendo o caminho de producao
 * (standalone e Docker).
 */

import { createServer, request as httpRequest } from "node:http"

const DEFAULT_API_PREFIX = "/api"

export function emsApiPlugin(options = {}) {
  const apiPrefix = options.apiPrefix ?? DEFAULT_API_PREFIX

  /** @type {{ port: number; close: () => Promise<void> } | null} */
  let bridge = null

  async function ensureBridge() {
    if (bridge) return bridge

    // Import dinamico: o backend e TypeScript executado nativamente pelo Node
    // (type stripping). O Vite so paga esse custo se houver requisicao em /api.
    const [{ createContainer }, { createApp }, { getEnvironment, loadDotEnv }] =
      await Promise.all([
        import("../backend/src/bootstrap/container.ts"),
        import("../backend/src/server/app.ts"),
        import("../backend/src/config/environment.ts"),
      ])

    loadDotEnv()

    const env = { ...getEnvironment(), ...(options.env ?? {}) }
    const container = await createContainer(env)
    const app = createApp({ services: container.services, env, logger: container.logger })

    // Socket efemero em 127.0.0.1:0 -> o Vite fala HTTP com o Express real.
    const server = createServer(app)
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))

    const address = server.address()
    const port = typeof address === "object" && address ? address.port : 0

    bridge = {
      port,
      close: async () => {
        container.stop()
        await new Promise((resolve) => server.close(resolve))
      },
    }

    return bridge
  }

  const middleware = async (req, res, next) => {
    const path = (req.url || "").split("?")[0]
    if (!path.startsWith(apiPrefix)) return next()

    let target
    try {
      target = await ensureBridge()
    } catch (error) {
      res.statusCode = 503
      res.setHeader("Content-Type", "application/json; charset=utf-8")
      res.end(
        JSON.stringify({
          error: {
            code: "API_UNAVAILABLE",
            message: "Backend indisponível: " + String(error),
          },
        }),
      )
      return
    }

    // Encaminha ao Express preservando metodo, headers e corpo.
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)

    const upstream = httpRequest(
      {
        host: "127.0.0.1",
        port: target.port,
        method: req.method,
        path: req.url,
        headers: { ...req.headers, host: "127.0.0.1" },
      },
      (upstreamRes) => {
        res.statusCode = upstreamRes.statusCode || 502
        for (const [key, value] of Object.entries(upstreamRes.headers)) {
          if (key === "transfer-encoding") continue
          res.setHeader(key, value)
        }
        upstreamRes.pipe(res)
      },
    )

    upstream.on("error", (error) => {
      if (!res.headersSent) {
        res.statusCode = 502
        res.setHeader("Content-Type", "application/json; charset=utf-8")
      }
      res.end(
        JSON.stringify({
          error: { code: "API_PROXY_ERROR", message: String(error) },
        }),
      )
    })

    if (chunks.length) upstream.write(Buffer.concat(chunks))
    upstream.end()
  }

  const hook = (server) => {
    server.middlewares.use((req, res, next) => {
      middleware(req, res, next).catch(next)
    })
  }

  return {
    name: "energymatrix-ems-api",
    configureServer: hook,
    configurePreviewServer: hook,
    async closeBundle() {
      if (bridge) await bridge.close()
      bridge = null
    },
  }
}

export default emsApiPlugin