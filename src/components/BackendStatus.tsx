import { useBackendStatus } from "../lib/api"

interface BackendStatusProps {
  /** 'light' para cabeçalho vermelho, 'dark' para fundos claros. */

  variant?: "light" | "dark"
}

/**
 * Indicador de conectividade com o backend EMS (/api/health).
 * Mostra "online + telemetria ao vivo" ou "offline + dados de demonstração".
 */

export function BackendStatus({ variant = "light" }: BackendStatusProps) {
  const status = useBackendStatus()

  const light = variant === "light"

  const dotColor = status.checking
    ? "#9CA3AF"
    : status.online
      ? "#4ADE80"
      : "#F59E0B"

  const label = status.checking
    ? "verificando…"
    : status.online
      ? `Backend online · v${status.version}`
      : "Backend offline · demo"

  return (
    <div
      title={
        status.online
          ? `${status.service} · uptime ${status.uptimeSeconds}s · telemetria ${
              status.live ? "ao vivo" : "pausada"
            }`
          : "API /api indisponível — exibindo dados de demonstração"
      }
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium whitespace-nowrap ${
        light
          ? "bg-white/10 border-white/20 text-white/85"
          : "bg-gray-50 border-gray-200 text-gray-600"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status.online && !status.checking ? "animate-pulse" : ""
        }`}
        style={{ backgroundColor: dotColor }}
      />
      <span className="hidden sm:inline">{label}</span>
      {status.online && status.live && (
        <span
          className={`hidden md:inline font-mono ${
            light ? "text-white/50" : "text-gray-400"
          }`}
        >
          · LIVE
        </span>
      )}
    </div>
  )
}
