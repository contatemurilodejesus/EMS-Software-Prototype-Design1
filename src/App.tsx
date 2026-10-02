import { useState } from "react"
import { useApiResource } from "./lib/api"
import { Header, type Module } from "./components/Header"
import { Dashboard } from "./components/Dashboard"
import { MachineryMonitor } from "./components/MachineryMonitor"
import { Diagnostics } from "./components/Diagnostics"
import { Protocols } from "./components/Protocols"
import { Economia } from "./components/Economia"
import { CompetitionMode } from "./components/CompetitionMode"
import { Reports } from "./components/Reports"
import { Admin } from "./components/Admin"

export default function App() {
  const [module, setModule] = useState<Module>("fabrica")

  // Contadores vêm do backend (/api/summary) com fallback local quando offline.
  const { data: summary, live } = useApiResource<{
    totals: { alerts: number; idleMachines: number }
  }>("/api/summary", { totals: { alerts: 6, idleMachines: 3 } }, {
    pollMs: 10000,
  })
  const ALERT_COUNT = live ? summary.totals.alerts : 6
  const IDLE_COUNT = live ? summary.totals.idleMachines : 3

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F5F5F5" }}>
      <Header
        activeModule={module}
        onModuleChange={setModule}
        alertCount={ALERT_COUNT}
        idleCount={IDLE_COUNT}
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
            EnergyMatrix EMS Industrial · v2.0.0 · energia + máquina + custo +
            diagnóstico + protocolo
          </span>
          <span className="font-mono">
            © 2026 EnergyMatrix · Protótipo de demonstração · dados simulados
          </span>
        </div>
      </footer>
    </div>
  )
}
