/**
 * EnergyMatrix EMS - entrada do backend (modo standalone).
 *
 *   node backend/src/server/index.ts     (ou `npm run server`)
 *
 * O backend embutido no Vite usa a MESMA aplicacao via `server/app.ts`.
 */

import { startServer } from "./server.ts"

startServer().catch((error: unknown) => {
  console.error("Falha ao iniciar o backend EnergyMatrix EMS:", error)
  process.exit(1)
})