/**
 * Startup do servidor HTTP standalone (`npm run server` -> :8787).
 *
 * Nao contem regra de negocio: monta o container, a aplicacao Express e a
 * porta. O modo embutido no Vite usa `app.ts` diretamente (ver vite-plugin).
 */

import type { Server } from "node:http"
import { createApp } from "./app.ts"
import { registerShutdownHandlers } from "./shutdown.ts"
import { createContainer, type Container } from "../bootstrap/container.ts"
import { getEnvironment, loadDotEnv, type Environment } from "../config/environment.ts"

export interface RunningServer {
  server: Server
  container: Container
  url: string
}

export async function startServer(options: { env?: Environment } = {}): Promise<RunningServer> {
  loadDotEnv()
  const env = options.env ?? getEnvironment()
  const container = await createContainer(env)
  const app = createApp({ services: container.services, env, logger: container.logger })

  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(env.port, env.host, () => resolve(listening))
  })

  const address = server.address()
  const port = typeof address === "object" && address ? address.port : env.port
  const url = `http://${env.host === "0.0.0.0" ? "localhost" : env.host}:${port}${env.apiPrefix}`

  container.logger.info("server_started", {
    url,
    persistence: env.persistence,
    live: env.live,
    simulatorIntervalMs: env.simulatorIntervalMs,
  })

  registerShutdownHandlers({
    server,
    logger: container.logger,
    closeResources: () => container.stop(),
  })

  return { server, container, url }
}