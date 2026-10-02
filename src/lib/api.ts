/**
 * Cliente da API EnergyMatrix EMS + hooks de consumo com fallback offline.
 *
 * - Em `vite dev` / `vite preview` o backend é servido em `/api` pelo plugin Vite.
 * - Para apontar a um backend externo (ex.: `npm run server`), defina
 *   `VITE_EMS_API_URL` (ex.: http://localhost:8787).
 * - Se a API estiver indisponível, os hooks devolvem o dado de fallback (mock),
 *   mantendo o protótipo 100% funcional offline.
 */

import { useCallback, useEffect, useRef, useState } from "react"

const ENV =
  (import.meta as unknown as { env?: Record<string, string | undefined> })
    .env ?? {}

export const API_BASE = ENV.VITE_EMS_API_URL ?? ""

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)

    this.name = "ApiError"

    this.status = status
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,

    headers:
      body === undefined
        ? { Accept: "application/json" }
        : { Accept: "application/json", "Content-Type": "application/json" },

    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!res.ok) {
    let message = `${method} ${path} → ${res.status}`

    try {
      const data = (await res.json()) as { error?: string }

      if (data?.error) message = data.error
    } catch {
      /* corpo não-JSON */
    }

    throw new ApiError(res.status, message)
  }

  if (res.status === 204) return undefined as T

  return (await res.json()) as T
}

export const apiGet = <T>(path: string) => request<T>("GET", path)

export const apiPost = <T>(path: string, body?: unknown) =>
  request<T>("POST", path, body)

export const apiPatch = <T>(path: string, body?: unknown) =>
  request<T>("PATCH", path, body)

export const apiDelete = <T>(path: string) => request<T>("DELETE", path)

export interface ResourceState<T> {
  /** Dado mais recente (API quando online, fallback quando offline). */

  data: T

  /** true quando o dado veio da API; false quando é o fallback local. */

  live: boolean

  loading: boolean

  error: string | null

  refetch: () => void
}

/**
 * Busca um recurso da API e mantém o dado de fallback enquanto a API responde.
 * `pollMs` habilita atualização automática (telemetria "ao vivo").
 */

export function useApiResource<T>(
  path: string,

  fallback: T,

  options: { pollMs?: number; enabled?: boolean } = {},
): ResourceState<T> {
  const { pollMs, enabled = true } = options

  const [data, setData] = useState<T>(fallback)

  const [live, setLive] = useState(false)

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState<string | null>(null)

  const [nonce, setNonce] = useState(0)

  const fallbackRef = useRef(fallback)

  fallbackRef.current = fallback

  useEffect(() => {
    if (!enabled) return undefined

    let cancelled = false

    let timer: number | undefined

    const load = async () => {
      try {
        const json = await apiGet<T>(path)

        if (cancelled) return

        setData(json)

        setLive(true)

        setError(null)
      } catch (err) {
        if (cancelled) return

        setLive(false)

        setError(
          err instanceof Error ? err.message : "Falha ao contactar o backend",
        )

        setData(fallbackRef.current)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    if (pollMs) timer = window.setInterval(load, pollMs)

    return () => {
      cancelled = true

      if (timer) window.clearInterval(timer)
    }
  }, [path, pollMs, enabled, nonce])

  const refetch = useCallback(() => setNonce((n) => n + 1), [])

  return { data, live, loading, error, refetch }
}

/** Executa mutações (POST/PATCH/DELETE) com estado de carregamento/erro. */

export function useApiAction() {
  const [busy, setBusy] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const run = useCallback(
    async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      setBusy(true)

      try {
        const result = await request<T>(method, path, body)

        setError(null)

        return result
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha na operação")

        throw err
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  return { run, busy, error }
}

export interface BackendStatus {
  online: boolean

  checking: boolean

  version?: string

  live?: boolean

  uptimeSeconds?: number

  service?: string
}

/** Verifica periodicamente a saúde do backend (para o indicador de status). */

export function useBackendStatus(pollMs = 15000): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>({
    online: false,
    checking: true,
  })

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      try {
        const health = await apiGet<{
          status: string
          version: string
          live: boolean
          uptimeSeconds: number
          service: string
        }>("/api/health")

        if (!cancelled) {
          setStatus({
            online: health.status === "ok",
            checking: false,
            version: health.version,
            live: health.live,
            uptimeSeconds: health.uptimeSeconds,
            service: health.service,
          })
        }
      } catch {
        if (!cancelled) setStatus({ online: false, checking: false })
      }
    }

    check()

    const timer = window.setInterval(check, pollMs)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [pollMs])

  return status
}
