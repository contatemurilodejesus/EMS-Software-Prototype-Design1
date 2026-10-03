/**
 * Shell da aplicacao (secao 14 do documento).
 *
 * Rotas publicas: /login, /invite e /unauthorized. Todo o resto exige sessao.
 * A navegacao e filtrada por permissao (RBAC - D13); o backend continua sendo
 * a autoridade: menus escondidos nao substituem a validacao no servidor.
 */

import { useEffect, useState } from "react"
import {
  clearSession,
  getAccessToken,
  getSessionUser,
  onSessionExpired,
  type UserRole,
} from "./lib/api"
import { Header, type Module } from "./components/Header"
import { LoginScreen } from "./components/Login"
import { InviteScreen, UnauthorizedScreen } from "./components/Invite"
import { Dashboard } from "./components/Dashboard"
import { MachineryMonitor } from "./components/MachineryMonitor"
import { Diagnostics } from "./components/Diagnostics"
import { Protocols } from "./components/Protocols"
import { Economia } from "./components/Economia"
import { CompetitionMode } from "./components/CompetitionMode"
import { Reports } from "./components/Reports"
import { Admin } from "./components/Admin"

/** Rotas publicas (rota sem barra inicial). */
type PublicRoute = "login" | "invite" | "unauthorized"

function currentRoute(): PublicRoute | "app" {
  const path = window.location.pathname.replace(/^\//, "")
  if (path === "login") return "login"
  if (path === "invite" || path === "first-access") return "invite"
  if (path === "unauthorized") return "unauthorized"
  return "app"
}

function navigate(route: string): void {
  window.history.pushState({}, "", route)
  window.dispatchEvent(new PopStateEvent("popstate"))
}

/** Modulos visiveis por role (D13). */
const ALLOWED: Record<Module, UserRole[]> = {
  fabrica: ["ADMIN", "ACCOUNTING", "MACHINE_EVALUATOR"],
  maquinas: ["ADMIN", "MACHINE_EVALUATOR"],
  alertas: ["ADMIN", "MACHINE_EVALUATOR"],
  protocolos: ["ADMIN", "MACHINE_EVALUATOR"],
  economia: ["ADMIN", "ACCOUNTING"],
  competicao: ["ADMIN", "ACCOUNTING", "MACHINE_EVALUATOR"],
  relatorios: ["ADMIN", "ACCOUNTING", "MACHINE_EVALUATOR"],
  admin: ["ADMIN"],
}

export function canAccess(module: Module, role: UserRole): boolean {
  return ALLOWED[module].includes(role)
}

export default function App() {
  const [route, setRoute] = useState<PublicRoute | "app">(currentRoute)
  const [sessionVersion, setSessionVersion] = useState(0)
  const [module, setModule] = useState<Module>("fabrica")
  const user = getSessionUser()

  useEffect(() => {
    const onPop = () => setRoute(currentRoute())
    const onSession = () => setSessionVersion((v) => v + 1)

    window.addEventListener("popstate", onPop)
    window.addEventListener("energymatrix:session", onSession)
    return () => {
      window.removeEventListener("popstate", onPop)
      window.removeEventListener("energymatrix:session", onSession)
    }
  }, [])

  // O cliente de API avisa quando o refresh falha: volta para /login.
  useEffect(
    () =>
      onSessionExpired(() => {
        navigate("/login")
        setRoute("login")
      }),
    [],
  )

  // Token expirado e refresh recusado: volta para /login.
  useEffect(() => {
    if (route !== "app" || user) return
    if (!getAccessToken()) navigate("/login")
  }, [route, user, sessionVersion])

  if (route === "login") {
    return (
      <LoginScreen
        onAuthenticated={() => {
          navigate("/")
          setRoute("app")
        }}
      />
    )
  }

  if (route === "invite") {
    return (
      <InviteScreen
        onDone={() => {
          navigate("/")
          setRoute("app")
        }}
      />
    )
  }

  if (route === "unauthorized") return <UnauthorizedScreen />

  if (!user) return <LoginScreen onAuthenticated={() => setRoute("app")} />

  // Modulo bloqueado para o role atual -> unauthorized.
  if (!canAccess(module, user.role)) {
    return <UnauthorizedScreen />
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F5F5F5" }}>
      <Header
        activeModule={module}
        onModuleChange={setModule}
        user={user}
        onLogout={() => {
          clearSession()
          navigate("/login")
          setRoute("login")
        }}
      />

      <main>
        {module === "fabrica" && <Dashboard />}
        {module === "maquinas" && <MachineryMonitor />}
        {module === "alertas" && <Diagnostics />}
        {module === "protocolos" && <Protocols />}
        {module === "economia" && <Economia />}
        {module === "competicao" && <CompetitionMode />}
        {module === "relatorios" && <Reports />}
        {module === "admin" && <Admin />}
      </main>

      <footer className="border-t border-gray-200 mt-8 py-3 px-5">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4 flex-wrap text-[10px] text-gray-400">
          <span>
            EnergyMatrix EMS Industrial · v3 · energia + máquina + custo +
            diagnóstico + protocolo
          </span>
          <span className="font-mono">
            © 2026 EnergyMatrix · demonstração · dados simulados
          </span>
        </div>
      </footer>
    </div>
  )
}
