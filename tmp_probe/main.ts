import { hello, type Kind } from "./dep.ts"
import express from "express"
import pg from "pg"
import { z } from "zod"
import pino from "pino"
import helmet from "helmet"

const kind: Kind = "a"
const app = express()
app.get("/probe", (_req, res) => {
  res.json({ ok: true, kind })
})
const server = app.listen(0, () => {
  const address = server.address()
  const port = typeof address === "object" && address ? address.port : 0
  void fetch(`http://127.0.0.1:${port}/probe`)
    .then((r) => r.json())
    .then((body) => {
      console.log(hello("node-ts"), JSON.stringify(body), typeof pg.Pool, typeof z.string, typeof pino, typeof helmet)
      server.close()
    })
})