/**
 * Entrada por codigo de convite (uso unico - secao 7.2) e tela 403.
 */

import { useState } from "react"
import { ApiError, apiRequest, type AuthSession } from "../lib/api"

function persistSession(session: AuthSession): void {
  localStorage.setItem("energymatrix.accessToken", session.accessToken)
  localStorage.setItem("energymatrix.refreshToken", session.refreshToken)
  localStorage.setItem("energymatrix.user", JSON.stringify(session.user))
}

export function InviteScreen({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    try {
      const session = await apiRequest<AuthSession>("POST", "/api/auth/invites/accept", {
        code: code.trim(),
        name: name.trim(),
        email: email.trim() || undefined,
        password,
      })
      persistSession(session)
      onDone()
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Codigo de convite invalido.",
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
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-3"
      >
        <h1 className="text-sm font-bold tracking-wide uppercase text-gray-800">
          Ativar acesso
        </h1>
        <p className="text-[11px] text-gray-500">
          Informe o codigo recebido do administrador da fabrica.
        </p>

        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Codigo do convite"
          required
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome completo"
          required
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail corporativo"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha (min. 8 caracteres)"
          required
          minLength={8}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
        />

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
          className="w-full bg-[#BC0202] text-white text-[12px] font-semibold uppercase rounded py-2.5 disabled:opacity-60"
        >
          {busy ? "Ativando..." : "Criar minha conta"}
        </button>
      </form>
    </div>
  )
}

/** 403 - autenticado, porem sem permissao para o recurso (secao 14). */
export function UnauthorizedScreen() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 text-center"
      style={{ backgroundColor: "#F5F5F5" }}
    >
      <div>
        <h1 className="text-2xl font-bold text-[#BC0202]">Acesso restrito</h1>
        <p className="text-sm text-gray-600 mt-2">
          Seu perfil nao tem permissao para este modulo. Fale com o administrador
          da fabrica.
        </p>
        <a
          href="/"
          className="inline-block mt-6 text-[12px] font-semibold uppercase tracking-wide text-white bg-[#BC0202] rounded px-4 py-2"
        >
          Voltar ao inicio
        </a>
      </div>
    </div>
  )
}