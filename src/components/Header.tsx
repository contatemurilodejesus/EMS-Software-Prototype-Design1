import { useState } from "react"
import { BackendStatus } from "./BackendStatus"
import { Logo } from "./Logo"

export type Module = "fabrica" | "maquinas" | "alertas" | "protocolos" | "economia" | "competicao" | "relatorios" | "admin"

interface HeaderProps {
  activeModule: Module
  onModuleChange: (m: Module) => void
  alertCount: number
  idleCount: number
}

const units = [
  "Planta SP — Guarulhos",
  "Planta RJ — Duque de Caxias",
  "Planta MG — Contagem",
]

const NAV: { id: Module; label: string; icon: string; demo?: boolean }[] = [
  {
    id: "fabrica",
    label: "Visão da Fábrica",
    icon: "M4 19V8l8-6 8 6v11h-5v-6h-6v6H4z",
  },
  {
    id: "maquinas",
    label: "Máquinas",
    icon: "M3 7h4v10H3V7zM10 4h4v13h-4V4zM17 10h4v7h-4v-7z",
  },
  { id: "alertas", label: "Alertas", icon: "M12 2L2 20h20L12 2zm0 5v6m0 3v1" },
  {
    id: "protocolos",
    label: "Protocolos",
    icon: "M6 3h9l4 4v14H6V3zm3 5h6M9 12h6M9 16h4",
  },
  { id: "economia", label: "Economia", icon: "M3 17l4-8 4 4 4-6 4 4" },
  {
    id: "competicao",
    label: "Competition Mode",
    icon: "M5 4h14v3H5V4zm0 5h14v3H5V9zm0 5h7v6H5v-6zm9 0h5v6h-5v-6z",
    demo: true,
  },
  {
    id: "relatorios",
    label: "Relatórios",
    icon: "M4 4h12l4 4v12H4V4zm8 3H8m4 4H8m8 4H8",
  },
  {
    id: "admin",
    label: "Administração",
    icon: "M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 9c-4.42 0-8 1.79-8 4v1h16v-1c0-2.21-3.58-4-8-4z",
  },
]

export function Header({
  activeModule,
  onModuleChange,
  alertCount,
  idleCount,
}: HeaderProps) {
  const [unit, setUnit] = useState(units[0])
  const [unitOpen, setUnitOpen] = useState(false)

  return (
    <header
      style={{ backgroundColor: "#BC0202" }}
      className="w-full shadow-md sticky top-0 z-40"
    >
      {/* Top bar */}
      <div className="max-w-screen-2xl mx-auto px-5">
        <div className="flex items-center h-13 gap-4">
          {/* Brand — logo oficial EnergyMatrix */}
          <div className="flex items-center gap-2.5 shrink-0">
            <Logo width={78} height={42} />
            <div className="hidden sm:block">
              <div className="text-white font-bold text-sm tracking-[0.15em] leading-none uppercase">
                EnergyMatrix
              </div>
              <div className="text-red-200 text-[9px] tracking-[0.18em] leading-none mt-[3px] uppercase">
                EMS Industrial · Protótipo
              </div>
            </div>
          </div>

          {/* Unit selector */}
          <div className="relative hidden lg:block ml-2">
            <button
              onClick={() => setUnitOpen(!unitOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-white/80 text-[11px] font-medium bg-white/10 hover:bg-white/20 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
                <path
                  d="M10 2L2 8v10h5v-6h6v6h5V8L10 2z"
                  fill="white"
                  fillOpacity="0.8"
                />
              </svg>
              {unit}
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                  d="M2 3.5L5 6.5L8 3.5"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            {unitOpen && (
              <div className="absolute top-full mt-1 left-0 bg-white rounded shadow-xl z-50 min-w-[210px] border border-gray-100">
                {units.map((u) => (
                  <button
                    key={u}
                    onClick={() => {
                      setUnit(u)
                      setUnitOpen(false)
                    }}
                    className={`block w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 transition-colors ${
                      u === unit
                        ? "font-semibold text-[#BC0202]"
                        : "text-gray-700"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1" />

          {/* Indicador de dados simulados (protótipo de demonstração) */}
          <span
            title="Protótipo de demonstração — telemetria e economia simuladas (não representam medição industrial real)"
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/25 text-[10px] font-bold tracking-wider text-white uppercase"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-300" />
            DEMO · dados simulados
          </span>

          {/* Status pills */}
          {idleCount > 0 && (
            <button
              onClick={() => onModuleChange("maquinas")}
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400/20 border border-amber-300/30 text-amber-200 text-[11px] font-semibold"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              {idleCount} IDLE
            </button>
          )}
          {alertCount > 0 && (
            <button
              onClick={() => onModuleChange("alertas")}
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white text-[11px] font-semibold"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path
                  d="M5.5 1L0.5 10H10.5L5.5 1Z"
                  stroke="white"
                  strokeWidth="1.2"
                  fill="none"
                />
                <path
                  d="M5.5 4V6.5M5.5 8H5.51"
                  stroke="white"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              {alertCount} alertas
            </button>
          )}

          {/* Backend / telemetria status */}
          <BackendStatus variant="light" />

          {/* User */}
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[#BC0202] text-xs font-bold bg-white">
            EM
          </div>
        </div>
      </div>

      {/* Nav tabs */}
      <div
        style={{ backgroundColor: "rgba(0,0,0,0.15)" }}
        className="border-t border-white/10"
      >
        <div className="max-w-screen-2xl mx-auto px-5 flex items-center gap-0.5 overflow-x-auto">
          {NAV.map(({ id, label, demo }) => (
            <button
              key={id}
              onClick={() => onModuleChange(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-medium tracking-wide whitespace-nowrap transition-colors border-b-2 ${
                activeModule === id
                  ? "border-white text-white"
                  : "border-transparent text-white/60 hover:text-white/90 hover:border-white/30"
              }`}
            >
              {label}
              {demo && (
                <span className="px-1.5 py-px rounded bg-amber-300 text-[#7a1a00] text-[8px] font-bold tracking-wider">
                  DEMO
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
