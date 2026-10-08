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
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Accept,X-Request-Id,X-Total-Count")
    res.setHeader("Access-Control-Expose-Headers", "X-Total-Count,X-Request-Id")

    if (req.method === "OPTIONS") {
      res.status(204).end()
      return
    }

    next()
  }
}

/**
 * Headers de seguranca ESTRITO (secao 11.2):
 *   - contentSecurityPolicy: bloqueia XSS/styles injection
 *   - xContentTypeOptions: evita MIME sniffing
 *   - xFrameOptions: evita clickjacking
 *   - xXSSProtection: mitigates reflex XSS (legacy browsers)
 *   - referrerPolicy: controla retorno de headers Referer
 *   - hsts: força HTTPS no browser
 */
export function securityHeaders(env: { isProduction: boolean }): RequestHandler {
  return (_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("X-Frame-Options", "DENY")
    res.setHeader("X-XSS-Protection", "1; mode=block")
    res.setHeader("Referrer-Policy", "same-origin")
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()")

    // CSP vem do helmet (disable no config para manter o dev simples)
    if (env.isProduction) {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.example.com;",
      )
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload",
      )
    }

    next()
  }
}