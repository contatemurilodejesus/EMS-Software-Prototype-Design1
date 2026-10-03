/**
 * Cliente da API EnergyMatrix EMS + hooks de consumo com fallback offline.
 *
 * - Em `vite dev` / `vite preview` o backend é servido em `/api` pelo plugin Vite.
 * - Para apontar a um backend externo (ex.: `npm run server`), defina
 *   `VITE_EMS_API_URL` (ex.: http://localhost:8787).
 * - Se a API estiver indisponível, os hooks devolvem o dado de fallback (mock),
 *   mantendo o protótipo funcional offline.
 *
 * AUTENTICACAO (secao 7 do documento): nenhum `fetch()` espalhado em
 * componentes. Este modulo e a unica camada que conhece token, refresh,
 * logout automatico e tratamento de erro. O token vive em `localStorage`
 * (apenas access e refresh token, nunca senha).
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

/* ------------------------------------------------------------------ */
/* Sessao                                                              */
/* ------------------------------------------------------------------ */

export type UserRole = "ADMIN" | "ACCOUNTING" | "MACHINE_EVALUATOR"

export interface SessionUser {
  id: string
  tenantId: string
  name: string
  email: string
  role: UserRole
  status: string
}

export interface AuthSession {
  accessToken: string
  refreshToken: string
  expiresInMinutes: number
  user: SessionUser
  tenant: { id: string; name: string; slug: string }
}

const ACCESS_KEY = "energymatrix.accessToken"
const REFRESH_KEY = "energymatrix.refreshToken"
const USER_KEY = "energymatrix.user"

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_KEY)
  } catch {
    return null
  }
}

export function getSessionUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as SessionUser) : null
  } catch {
    return null
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
  } catch {
    /* armazenamento indisponivel */
  }
}

function storeSession(session: AuthSession): void {
  try {
    localStorage.setItem(ACCESS_KEY, session.accessToken)
    localStorage.setItem(REFRESH_KEY, session.refreshToken)
    localStorage.setItem(USER_KEY, JSON.stringify(session.user))
  } catch {
    /* armazenamento indisponivel */
  }
  window.dispatchEvent(new CustomEvent("energymatrix:session", { detail: session.user }))
}

/**
 * Encerra a navegacao em /login quando a sessao morre.
 *
 * Devolve um valor vazio tipado como `T`: o chamador esta num caminho de erro
 * e o componente vai renderizar o estado de "sem sessao", nao os dados.
 */
function navigateToLogin<T>(): T {
  if (!window.location.pathname.startsWith("/login")) {
    window.history.pushState({}, "", "/login")
    window.dispatchEvent(new PopStateEvent("popstate"))
  }
  return undefined as T
}

/** Dispara para o shell ouvir: a sessao expirou e o token foi removido. */
export function onSessionExpired(handler: () => void): () => void {
  window.addEventListener("energymatrix:session-expired", handler)
  return () => window.removeEventListener("energymatrix:session-expired", handler)
}

/** Login: e-mail + senha -> sessao persistida (POST /api/auth/login). */
export async function login(email: string, password: string): Promise<SessionUser> {
  const session = await request<AuthSession>("POST", "/api/auth/login", { email, password })
  storeSession(session)
  return session.user
}

/** Logout: revoga o refresh token no backend e encerra a sessao local. */
export async function logout(): Promise<void> {
  const refreshToken = localStorage.getItem(REFRESH_KEY)
  try {
    if (refreshToken) {
      await request("POST", "/api/auth/logout", { refreshToken })
    }
  } catch {
    /* mesmo com falha de rede, a sessao local e encerrada */
  }
  clearSession()
}

/* ------------------------------------------------------------------ */
/* Refresh automatico (uma unica renovacao por vez)                     */
/* ------------------------------------------------------------------ */

let refreshing: Promise<boolean> | null = null

async function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing

  refreshing = (async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY)
    if (!refreshToken) return false

    try {
      const response = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      })

      if (!response.ok) {
        clearSession()
        return false
      }

      storeSession((await response.json()) as AuthSession)
      return true
    } catch {
      return false
    } finally {
      refreshing = null
    }
  })()

  return refreshing
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retry = true,
): Promise<T> {
  const token = getAccessToken()

  const headers: Record<string, string> =
    body === undefined
      ? { Accept: "application/json" }
      : { Accept: "application/json", "Content-Type": "application/json" }

  // O tenant NUNCA vai no header: ele vem das claims do token (secao 7.1).
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  // Token expirado: renova uma vez e repete a requisicao.
  if (res.status === 401 && retry && !path.startsWith("/api/auth/")) {
    const renewed = await refreshSession()
    if (renewed) return request<T>(method, path, body, false)

    // Sessao morta de verdade: encerra a local e volta ao login, em vez de
    // deixar a tela mostrar dado de fallback indefinidamente.
    clearSession()
    window.dispatchEvent(new CustomEvent("energymatrix:session-expired"))
    return navigateToLogin()
  }

  if (!res.ok) {
    let message = `${method} ${path} → ${res.status}`

    try {
      const data = (await res.json()) as {
        error?: string | { message?: string }
      }

      if (typeof data?.error === "string") message = data.error
      else if (data?.error?.message) message = data.error.message
    } catch {
      /* corpo não-JSON */
    }

    throw new ApiError(res.status, message)
  }

  if (res.status === 204) return undefined as T

  return (await res.json()) as T
}

export const apiGet = <T>(path: string) => request<T>("GET", path)

/** Client autenticado: usado pelos hooks e por Invite.tsx. */
export const apiRequest = request

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
 * Busca um recurso da API.
 *
 * `placeholder` e usado APENAS enquanto a primeira resposta nao chega (evita
 * tela vazia no primeiro render). Se a API falhar, o hook expoe `error` e
 * `live=false` e NAO substitui o dado por mock: exibir numero inventado como
 * se fosse medicao real quebra a distincao dado-real vs simulado.
 *
 * `pollMs` habilita atualizacao periodica (telemetria "ao vivo").
 */
export function useApiResource<T>(
  path: string,
  placeholder: T,
  options: { pollMs?: number; enabled?: boolean } = {},
): ResourceState<T> {
  const { pollMs, enabled = true } = options

  const [data, setData] = useState<T>(placeholder)
  const [live, setLive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return undefined
    }

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
        setError(err instanceof Error ? err.message : "Falha ao contacting o backend")
        // Nao troca por mock: o erro fica visivel para o componente decidir.
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
