/**
 * Seguranca criptografica - SEM dependencias externas (node:crypto).
 *
 * - Senhas: scrypt (KDF memoria-rigida, mesmo principio do argon2/bcrypt
 *   exigido pela secao 6.1). Escolha técnica: scrypt vem embutido no Node,
 *   evita compilar nativos (bcrypt/argon2) no ambiente da competição, e e
 *   aceito como "hash seguro" pelo documento (6.1: "argon2 ou bcrypt" -
 *   substituição justificada na secao 16: "substituí-la por alternativa
 *   compatível e justificar tecnicamente").
 * - JWT: HS256 implementado com HMAC-SHA256 (RFC 7519). Access token curto;
 *   refresh token e valor opaco aleatorio guardado como hash (D5).
 */

import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto"

/* ---------------- Senhas (scrypt) ---------------- */

const SCRYPT_KEYLEN = 64
const SCRYPT_COST = 16384

/** Gera hash no formato `scrypt$<salt-hex>$<hash-hex>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST })
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`
}

/** Comparacao em tempo constante. Nunca lanca erro de formato. */
export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, saltHex, hashHex] = stored.split("$")
    if (scheme !== "scrypt" || !saltHex || !hashHex) return false
    const expected = Buffer.from(hashHex, "hex")
    const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length, {
      N: SCRYPT_COST,
    })
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

/* ---------------- Tokens aleatorios ---------------- */

/** Codigo/opaco de 32 bytes em base64url (convites, refresh tokens). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url")
}

/** Hash SHA-256 hex - usado para guardar refresh tokens e codigos de convite. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

/* ---------------- JWT (HS256) ---------------- */

export interface JwtClaims {
  sub: string
  tenantId: string
  role: string
  /** "access" | "refresh" - o refresh nunca entra no Authorization. */
  kind: "access" | "refresh"
  iat: number
  exp: number
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

function signHmac(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url")
}

export function signJwt(
  claims: Omit<JwtClaims, "iat" | "exp">,
  options: { secret: string; ttlSeconds: number; now?: Date },
): string {
  const now = options.now ?? new Date()
  const iat = Math.floor(now.getTime() / 1000)
  const full: JwtClaims = { ...claims, iat, exp: iat + options.ttlSeconds }
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const payload = b64url(JSON.stringify(full))
  const data = `${header}.${payload}`
  return `${data}.${signHmac(data, options.secret)}`
}

export type JwtResult =
  | { ok: true; claims: JwtClaims }
  | { ok: false; reason: "malformed" | "signature" | "expired" }

export function verifyJwt(token: string, secret: string, now?: Date): JwtResult {
  const parts = token.split(".")
  if (parts.length !== 3) return { ok: false, reason: "malformed" }
  const [header, payload, signature] = parts

  const expected = signHmac(`${header}.${payload}`, secret)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature" }
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as JwtClaims
    if (typeof claims.exp !== "number" || typeof claims.sub !== "string") {
      return { ok: false, reason: "malformed" }
    }
    const current = Math.floor((now ?? new Date()).getTime() / 1000)
    if (claims.exp <= current) return { ok: false, reason: "expired" }
    return { ok: true, claims }
  } catch {
    return { ok: false, reason: "malformed" }
  }
}
