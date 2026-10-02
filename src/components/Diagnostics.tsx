import { useState } from "react"
import { useApiResource, useApiAction } from "../lib/api"

type Severity = "critical" | "high" | "medium"
type AlertStatus = "open" | "acknowledged" | "resolved"

interface Alert {
  id: string
  machine: string
  machineId: string
  sector: string
  anomaly: string
  anomalyType: string
  condition: string
  peakTime: string
  severity: Severity
  status: AlertStatus
  action: string
  detectedAt: string
  acknowledgedAt?: string
  resolvedAt?: string
  assignee?: string
  idleCost?: string
}

/** Fallback local — usado apenas quando o backend está indisponível. */
const fallbackAlerts: Alert[] = [
  {
    id: "ALT-2026-0041",
    machine: "Centro de Usinagem DMG 60",
    machineId: "CNC-02",
    sector: "Setor D",
    anomaly: "Fuga de Corrente",
    anomalyType: "Elétrico",
    condition: "I_fase_A = 91,2 A por ≥ 8 min (P_run = 8 kW, corrente anormal)",
    peakTime: "09:15 – contínuo",
    severity: "critical",
    status: "open",
    action:
      "Desligar equipamento. Medir resistência de isolação (megôhmetro). Verificar cabos de alimentação e aterramento.",
    detectedAt: "30/09/2026 09:15",
  },
  {
    id: "ALT-2026-0040",
    machine: "Compressor Schulz 55kW",
    machineId: "COMP-02",
    sector: "Setor B",
    anomaly: "Sobrecorrente + Temperatura Crítica",
    anomalyType: "Sobrecarga",
    condition:
      "I = 78,4 A (nominal 55 kW / 380V ≈ 102 A, porém T = 97°C > limite 85°C)",
    peakTime: "08:22 – contínuo",
    severity: "critical",
    status: "acknowledged",
    action:
      "Substituir filtro de ar. Verificar pressão do sistema e rolamentos. Checar válvula de alívio.",
    detectedAt: "30/09/2026 08:22",
    acknowledgedAt: "30/09/2026 08:35",
    assignee: "Técnico M. Santos",
  },
  {
    id: "ALT-2026-0039",
    machine: "Injetora Krauss 350T",
    machineId: "INJ-02",
    sector: "Setor A",
    anomaly: "IDLE prolongado (47 min)",
    anomalyType: "Consumo Improdutivo",
    condition:
      "Estado IDLE por ≥ 30 min (P entre P_off=2 kW e P_run=18 kW sem produção registrada)",
    peakTime: "13:45 – contínuo",
    severity: "high",
    status: "open",
    action:
      "Verificar se a máquina pode ser desligada. Operador deve registrar motivo da pausa ou desligar.",
    detectedAt: "30/09/2026 13:45",
    idleCost: "R$ 412/dia estimado",
  },
  {
    id: "ALT-2026-0038",
    machine: "Fresadora CNC Mazak QT",
    machineId: "CNC-03",
    sector: "Setor D",
    anomaly: "IDLE prolongado (68 min)",
    anomalyType: "Consumo Improdutivo",
    condition: "Estado IDLE por ≥ 30 min — maior custo de IDLE da fábrica hoje",
    peakTime: "12:50 – contínuo",
    severity: "high",
    status: "open",
    action:
      "Desligar às 13h se sem previsão de retorno. Registrar a intervenção para comprovação de economia.",
    detectedAt: "30/09/2026 12:50",
    idleCost: "R$ 892/dia estimado",
  },
  {
    id: "ALT-2026-0037",
    machine: "Injetora Krauss 350T",
    machineId: "INJ-02",
    sector: "Setor A",
    anomaly: "Fator de Potência Baixo (FP = 0,79)",
    anomalyType: "Qualidade de Energia",
    condition: "FP_periodo = kWh/√(kWh²+kvarh²) = 0,79 < 0,85 por > 2h",
    peakTime: "11:00 – 13:30",
    severity: "high",
    status: "acknowledged",
    action:
      "Verificar banco de capacitores. Checar contatos (possível aberto). Solicitar analisador de qualidade.",
    detectedAt: "30/09/2026 11:00",
    acknowledgedAt: "30/09/2026 11:20",
    assignee: "Técnico E. Lima",
  },
  {
    id: "ALT-2026-0036",
    machine: "Prensa Excêntrica 80T",
    machineId: "PRENSA-02",
    sector: "Setor C",
    anomaly: "IDLE (23 min) · Variação de Tensão",
    anomalyType: "Misto",
    condition: "IDLE 23 min + V = 376 V (–1,0% nominal) por > 1h",
    peakTime: "13:15 – contínuo",
    severity: "medium",
    status: "acknowledged",
    action:
      "Verificar conexões no quadro QD-C. Medir queda de tensão no ramal de alimentação.",
    detectedAt: "30/09/2026 13:15",
    acknowledgedAt: "30/09/2026 13:40",
    assignee: "Técnico M. Santos",
  },
  {
    id: "ALT-2026-0035",
    machine: "Compressor Atlas 75kW",
    machineId: "COMP-01",
    sector: "Setor B",
    anomaly: "Consumo acima da baseline (+12%)",
    anomalyType: "Eficiência",
    condition:
      "CUSUM: E_medido > E_esperado(produção) por 3 dias consecutivos, z_robusto = 4,1",
    peakTime: "07:00 – 09:00",
    severity: "medium",
    status: "resolved",
    action:
      "Programação de temporização ajustada. Ciclos desnecessários eliminados. Economia estimada: R$ 290/mês.",
    detectedAt: "29/09/2026 07:00",
    acknowledgedAt: "29/09/2026 08:10",
    resolvedAt: "29/09/2026 16:30",
    assignee: "Técnico M. Santos",
  },
]

const sevCfg: Record<Severity, {
  label: string
  badge: string
  row: string
  text: string
  borderLeft: string
}> = {
  critical: {
    label: "Crítico",
    badge: "bg-[#BC0202] text-white",
    row: "bg-red-50/60",
    text: "text-[#BC0202]",
    borderLeft: "border-l-[#BC0202]",
  },
  high: {
    label: "Alto",
    badge: "bg-[#D97706] text-white",
    row: "bg-amber-50/40",
    text: "text-[#D97706]",
    borderLeft: "border-l-[#D97706]",
  },
  medium: {
    label: "Médio",
    badge: "bg-gray-200 text-gray-700",
    row: "",
    text: "text-gray-600",
    borderLeft: "border-l-gray-300",
  },
}

const statusCfg: Record<AlertStatus, {
  label: string
  cls: string
  icon: string
}> = {
  open: {
    label: "Aberto",
    cls: "bg-red-50 text-[#BC0202] border-red-200",
    icon: "○",
  },
  acknowledged: {
    label: "Reconhecido",
    cls: "bg-blue-50 text-blue-700 border-blue-200",
    icon: "◑",
  },
  resolved: {
    label: "Resolvido",
    cls: "bg-green-50 text-[#16A34A] border-green-200",
    icon: "●",
  },
}

const LIFECYCLE: AlertStatus[] = ["open", "acknowledged", "resolved"]

export function Diagnostics() {
  const [sevFilter, setSevFilter] = useState<Severity | "all">("all")
  const [stFilter, setStFilter] = useState<AlertStatus | "all">("all")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Record<string, AlertStatus>>({})

  // Alertas vindos do backend; o ciclo de vida é persistido via /api/alerts/:id/advance.
  const { data: alerts, refetch } = useApiResource<Alert[]>(
    "/api/alerts",
    fallbackAlerts,
    { pollMs: 15000 },
  )
  const { run } = useApiAction()

  const getStatus = (a: Alert): AlertStatus => statuses[a.id] ?? a.status
  const advance = async (id: string, current: AlertStatus) => {
    const next = LIFECYCLE[LIFECYCLE.indexOf(current) + 1]
    if (!next) return
    // Atualização otimista — mantém a UI responsiva se o backend estiver offline.
    setStatuses((s) => ({ ...s, [id]: next }))
    try {
      await run("POST", `/api/alerts/${id}/advance`, {})
      refetch()
    } catch {
      /* backend offline: mantém a transição local */
    }
  }

  const filtered = alerts.filter((a) => {
    if (sevFilter !== "all" && a.severity !== sevFilter) return false
    if (stFilter !== "all" && getStatus(a) !== stFilter) return false
    return true
  })

  const openCritical = alerts.filter(
    (a) => a.severity === "critical" && getStatus(a) !== "resolved",
  ).length
  const totalIdle = alerts.filter(
    (a) =>
      a.anomalyType === "Consumo Improdutivo" && getStatus(a) !== "resolved",
  ).length

  return (
    <div className="max-w-screen-2xl mx-auto px-5 py-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm font-semibold text-[#1F2A37]">
            Alertas — Planta SP Guarulhos
          </h1>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Anomalias detectadas automaticamente · ciclo aberto → reconhecido →
            resolvido
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {openCritical > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded px-3 py-1.5 text-xs font-semibold text-[#BC0202]">
              <span className="w-2 h-2 rounded-full bg-[#BC0202] animate-pulse" />
              {openCritical} crítico{openCritical > 1 ? "s" : ""} sem ação
            </div>
          )}
          {totalIdle > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 text-xs font-semibold text-amber-700">
              <span className="w-2 h-2 rounded-full bg-[#D97706]" />
              {totalIdle} IDLE em aberto
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-1 items-center">
          <span className="text-[10px] text-gray-400 mr-1">Gravidade:</span>
          {(["all", "critical", "high", "medium"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setSevFilter(f)}
              className={`px-2.5 py-0.5 rounded text-[10px] font-medium transition-colors border ${
                sevFilter === f
                  ? "bg-[#1F2A37] text-white border-[#1F2A37]"
                  : "bg-white text-gray-500 border-gray-200"
              }`}
            >
              {
                {
                  all: "Todos",
                  critical: "Crítico",
                  high: "Alto",
                  medium: "Médio",
                }[f]
              }
            </button>
          ))}
        </div>
        <div className="flex gap-1 items-center">
          <span className="text-[10px] text-gray-400 mr-1">Status:</span>
          {(["all", "open", "acknowledged", "resolved"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStFilter(f)}
              className={`px-2.5 py-0.5 rounded text-[10px] font-medium transition-colors border ${
                stFilter === f
                  ? "bg-[#1F2A37] text-white border-[#1F2A37]"
                  : "bg-white text-gray-500 border-gray-200"
              }`}
            >
              {
                {
                  all: "Todos",
                  open: "Aberto",
                  acknowledged: "Reconhecido",
                  resolved: "Resolvido",
                }[f]
              }
            </button>
          ))}
        </div>
        <span className="ml-auto text-[10px] text-gray-400">
          {filtered.length} alerta{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded border border-gray-200 overflow-hidden">
        {/* Header row */}
        <div className="hidden lg:grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
          <div className="col-span-1">ID</div>
          <div className="col-span-2">Máquina</div>
          <div className="col-span-2">Tipo</div>
          <div className="col-span-2">Anomalia</div>
          <div className="col-span-1">Horário</div>
          <div className="col-span-1">Grav.</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1">Responsável</div>
          <div className="col-span-1"></div>
        </div>

        {filtered.map((a) => {
          const sev = sevCfg[a.severity]
          const st = getStatus(a)
          const stc = statusCfg[st]
          const isExpanded = expanded === a.id

          return (
            <div
              key={a.id}
              className={`border-b border-gray-100 last:border-0 border-l-2 ${sev.borderLeft}`}
            >
              <div
                className={`grid grid-cols-12 gap-2 px-4 py-3 items-center cursor-pointer hover:bg-gray-50 transition-colors ${sev.row}`}
                onClick={() => setExpanded(isExpanded ? null : a.id)}
              >
                <div className="col-span-1 font-mono text-[9px] text-gray-400">
                  {a.id.replace("ALT-2026-", "#")}
                </div>
                <div className="col-span-2">
                  <div className="text-[11px] font-semibold text-[#1F2A37] leading-tight">
                    {a.machine}
                  </div>
                  <div className="text-[9px] text-gray-400 font-mono">
                    {a.machineId} · {a.sector}
                  </div>
                </div>
                <div className="col-span-2 text-[10px] text-gray-600">
                  {a.anomalyType}
                </div>
                <div className="col-span-2">
                  <div className="text-[11px] text-[#1F2A37]">{a.anomaly}</div>
                  {a.idleCost && (
                    <div className="text-[9px] text-amber-600 font-mono font-semibold">
                      {a.idleCost}
                    </div>
                  )}
                </div>
                <div className="col-span-1 font-mono text-[9px] text-gray-500 leading-tight">
                  {a.peakTime}
                </div>
                <div className="col-span-1">
                  <span
                    className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-bold ${sev.badge}`}
                  >
                    {sev.label}
                  </span>
                </div>
                <div className="col-span-1">
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium border ${stc.cls}`}
                  >
                    <span className="text-[10px]">{stc.icon}</span>
                    {stc.label}
                  </span>
                </div>
                <div className="col-span-1 text-[10px] text-gray-500">
                  {a.assignee ?? <span className="text-gray-300">—</span>}
                </div>
                <div className="col-span-1 flex justify-end">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className={`text-gray-400 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  >
                    <path
                      d="M2 4L6 8L10 4"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-50">
                  {/* Lifecycle stepper */}
                  <div className="flex items-center gap-0 mb-3 mt-3">
                    {LIFECYCLE.map((step, i) => {
                      const sc = statusCfg[step]
                      const done = LIFECYCLE.indexOf(st) >= i
                      return (
                        <div key={step} className="flex items-center">
                          <div
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-semibold border ${
                              done
                                ? sc.cls
                                : "bg-gray-50 text-gray-400 border-gray-200"
                            }`}
                          >
                            {sc.icon} {sc.label}
                          </div>
                          {i < LIFECYCLE.length - 1 && (
                            <div
                              className={`h-px w-6 mx-1 ${
                                LIFECYCLE.indexOf(st) > i
                                  ? "bg-[#1F2A37]"
                                  : "bg-gray-200"
                              }`}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Condition */}
                  <div className="mb-3 bg-gray-50 rounded border border-gray-100 px-3 py-2">
                    <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                      Condição detectada
                    </div>
                    <div className="text-[10px] text-gray-600 font-mono leading-relaxed">
                      {a.condition}
                    </div>
                  </div>

                  {/* Action */}
                  <div
                    className={`rounded border p-3 text-xs ${
                      a.severity === "critical"
                        ? "bg-red-50 border-red-200"
                        : a.severity === "high"
                          ? "bg-amber-50 border-amber-200"
                          : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div className={`font-semibold mb-1 ${sev.text}`}>
                      {st === "resolved"
                        ? "Ação Executada"
                        : "Ação Recomendada"}
                    </div>
                    <p className="text-gray-700 leading-relaxed">{a.action}</p>
                    <div className="mt-2 pt-2 border-t border-current/10 flex flex-wrap gap-4 text-[9px] text-gray-400 font-mono">
                      <span>Detectado: {a.detectedAt}</span>
                      {a.acknowledgedAt && (
                        <span>Reconhecido: {a.acknowledgedAt}</span>
                      )}
                      {a.resolvedAt && <span>Resolvido: {a.resolvedAt}</span>}
                      {a.assignee && <span>Responsável: {a.assignee}</span>}
                    </div>
                  </div>

                  {/* Action buttons */}
                  {st !== "resolved" && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          advance(a.id, st)
                        }}
                        className="px-3 py-1.5 rounded text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
                        style={{ backgroundColor: "#BC0202" }}
                      >
                        {st === "open"
                          ? "Reconhecer Alerta"
                          : "Marcar como Resolvido"}
                      </button>
                      <button className="px-3 py-1.5 rounded text-[11px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors">
                        Gerar OS
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
