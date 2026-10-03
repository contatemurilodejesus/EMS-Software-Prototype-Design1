/**
 * Tela publica de LOGIN (secao 7.3 do documento).
 *
 * A senha nunca e persistida: apos o login, so ficam access e refresh token
 * (ver `lib/api.ts`). O tenant vem do token - o frontend nao escolhe tenant.
 */

import { useState } from "react"
import { Logo } from "./Logo"
import { ApiError, login } from "../lib/api"

export function LoginScreen({
  onAuthenticated,
}: {
  onAuthenticated: () => void
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      await login(email.trim(), password)
      onAuthenticated()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Nao foi possivel falar com o backend.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "#F5F5F5" }}
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <Logo width={96} height={52} />
          <h1 className="text-sm font-bold tracking-[0.15em] uppercase text-gray-800 mt-3">
            EnergyMatrix
          </h1>
          <p className="text-[10px] tracking-[0.18em] uppercase text-gray-500">
            EMS Industrial
          </p>
        </div>

        <form
          onSubmit={submit}
          className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-4"
        >
          <div>
            <label
              htmlFor="email"
              className="block text-[11px] font-semibold text-gray-700 mb-1"
            >
              E-mail
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#BC0202]"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-[11px] font-semibold text-gray-700 mb-1"
            >
              Senha
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#BC0202]"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="text-[11px] text-[#BC0202] bg-red-50 border border-red-200 rounded px-3 py-2"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-[#BC0202] text-white text-[12px] font-semibold tracking-wide uppercase rounded py-2.5 hover:bg-[#9c0202] disabled:opacity-60 transition-colors"
          >
            {busy ? "Entrando..." : "Entrar"}
          </button>

          <p className="text-[10px] text-gray-500 text-center">
            O acesso usa convite individual. Nao existe senha compartilhada.
          </p>
        </form>
      </div>
    </div>
  )
}