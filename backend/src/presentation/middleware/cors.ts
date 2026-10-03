/**
 * CORS simples (sem dependencia externa): libera apenas as origens
 * configuradas (`CORS_ORIGIN`, padrao `*` no ambiente de demonstracao).
 */

import type { RequestHandler } from "express"

export function cors(origin: string | undefined): RequestHandler {
  const allowed = origin && origin !== "*" ? origin.split(",").map((o) => o.trim()) : null

  return (req, res, next) => {
    const requestOrigin = req.headers.origin

    if (!allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin || "*")
    } else if (requestOrigin && allowed.includes(requestOrigin)) {
      res.setHeader("Access-Control-Allow-Origin", requestOrigin)
      res.setHeader("Vary", "Origin")
    }

    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Accept,X-Request-Id")
    res.setHeader("Access-Control-Expose-Headers", "X-Total-Count,X-Request-Id")

    if (req.method === "OPTIONS") {
      res.status(204).end()
      return
    }

    next()
  }
}