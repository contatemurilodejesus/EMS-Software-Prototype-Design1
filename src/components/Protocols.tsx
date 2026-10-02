import { useState } from "react"

import { useApiResource, useApiAction } from "../lib/api"

import type {
  Protocol,
  ProtocolsSummary,
  ProtocolStatus,
  ProtocolPriority,
  SlaState,
} from "../lib/types"

const STATUS_LABELS: Record<ProtocolStatus, string> = {
  open: "Aberto",
  in_progress: "Em tratamento",
  pending_validation: "Aguardando validação",

  closed: "Encerrado",
  cancelled: "Cancelado",
}

const STATUS_STYLE: Record<ProtocolStatus, { bg: string; fg: string }> = {
  open: { bg: "#FEF2F2", fg: "#BC0202" },

  in_progress: { bg: "#EFF6FF", fg: "#2563EB" },

  pending_validation: { bg: "#FFFBEB", fg: "#D97706" },

  closed: { bg: "#ECFDF5", fg: "#16A34A" },

  cancelled: { bg: "#F3F4F6", fg: "#6B7280" },
}

const PRIORITY_LABELS: Record<ProtocolPriority, string> = {
  critical: "Crítica",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
}

const PRIORITY_STYLE: Record<ProtocolPriority, string> = {
  critical: "#BC0202",
  high: "#D97706",
  medium: "#6B7280",
  low: "#9CA3AF",
}

const SLA_STYLE: Record<SlaState, { label: string; fg: string; bg: string }> = {
  running: { label: "SLA em curso", fg: "#2563EB", bg: "#EFF6FF" },

  at_risk: { label: "SLA em risco", fg: "#D97706", bg: "#FFFBEB" },

  breached: { label: "SLA violado", fg: "#BC0202", bg: "#FEF2F2" },

  met: { label: "SLA cumprido", fg: "#16A34A", bg: "#ECFDF5" },

  cancelled: { label: "Cancelado", fg: "#6B7280", bg: "#F3F4F6" },
}

/** Fallback local determinístico — usado apenas quando a API está indisponível. */

const FALLBACK_PROTOCOLS: Protocol[] = [
  {
    id: "EMS-2026-0003",
    title: "Sobrecorrente no Compressor Schulz 55kW",
    machineId: "COMP-02",
    machine: "Compressor Schulz 55kW",
    sector: "Setor B",

    origin: "Alerta automático",
    priority: "critical",
    status: "in_progress",
    alertId: "ALT-2026-0040",
    assignee: "Técnico M. Santos",

    description:
      "Corrente de 78,4 A com temperatura de 97°C. Inspeção elétrica e térmica em andamento.",
    openedAt: "2026-09-30T08:22:00",

    closedAt: null,
    deadline: "2026-09-30T12:22:00",
    sla: "breached",
    slaLabel: "SLA violado",
    slaHours: 4,
    hoursToDeadline: -20,

    evidence: ["I_fase = 78,4 A", "T = 97 °C (limite 85 °C)"],

    events: [
      {
        at: "2026-09-30T08:22:00",
        type: "abertura",
        actor: "Sistema EMS",
        note: "Protocolo aberto automaticamente a partir do alerta ALT-2026-0040.",
      },

      {
        at: "2026-09-30T08:35:00",
        type: "tratativa",
        actor: "Técnico M. Santos",
        note: "Alerta reconhecido; equipe acionada.",
      },
    ],
  },

  {
    id: "EMS-2026-0002",
    title: "IDLE prolongado — Fresadora CNC Mazak QT",
    machineId: "CNC-03",
    machine: "Fresadora CNC Mazak QT",
    sector: "Setor D",

    origin: "Alerta automático",
    priority: "high",
    status: "pending_validation",
    alertId: "ALT-2026-0038",
    assignee: "Técnico E. Lima",

    description:
      "Máquina em IDLE por 68 min. Intervenção de desligamento fora de turno aplicada.",
    openedAt: "2026-09-30T12:50:00",

    closedAt: null,
    deadline: "2026-10-01T12:50:00",
    sla: "at_risk",
    slaLabel: "SLA em risco",
    slaHours: 24,
    hoursToDeadline: 3.2,

    evidence: ["IDLE 68 min", "R$ 892/dia estimado"],

    events: [
      {
        at: "2026-09-30T12:50:00",
        type: "abertura",
        actor: "Sistema EMS",
        note: "Protocolo aberto a partir do alerta de consumo improdutivo.",
      },

      {
        at: "2026-09-30T13:20:00",
        type: "tratativa",
        actor: "Técnico E. Lima",
        note: "Desligamento agendado para 13h conforme recomendação.",
      },
    ],
  },

  {
    id: "EMS-2026-0001",
    title: "Ajuste de temporização — Compressor Atlas 75kW",
    machineId: "COMP-01",
    machine: "Compressor Atlas 75kW",
    sector: "Setor B",

    origin: "Manutenção preventiva",
    priority: "medium",
    status: "closed",
    alertId: "ALT-2026-0035",
    assignee: "Técnico M. Santos",

    description: "Ciclos desnecessários eliminados com ajuste de temporização.",
    openedAt: "2026-09-29T07:00:00",

    closedAt: "2026-09-29T16:30:00",
    deadline: "2026-10-02T07:00:00",
    sla: "met",
    slaLabel: "SLA cumprido",
    slaHours: 72,
    hoursToDeadline: 0,

    evidence: ["Economia estimada: R$ 290/mês"],

    events: [
      {
        at: "2026-09-29T07:00:00",
        type: "abertura",
        actor: "Operador EMS",
        note: "Protocolo aberto a partir de alerta de eficiência.",
      },

      {
        at: "2026-09-29T16:30:00",
        type: "encerramento",
        actor: "Supervisor L. Rocha",
        note: "Protocolo encerrado dentro do SLA.",
      },
    ],
  },
]

const FALLBACK_SUMMARY: ProtocolsSummary = {
  total: 3,
  open: 2,

  byStatus: {
    open: 0,
    in_progress: 1,
    pending_validation: 1,
    closed: 1,
    cancelled: 0,
  },

  bySla: { running: 0, at_risk: 1, breached: 1, met: 1 },

  criticalOpen: 1,
}

const fmtIso = (v: string | null) =>
  v ? v.replace("T", " ").slice(0, 16) : "—"

const EVENT_ICON: Record<string, string> = {
  abertura: "○",
  tratativa: "◔",
  evidência: "▣",
  validação: "✓",
  encerramento: "●",
  cancelamento: "✕",
  comentário: "·",
}

/* --------------------------------- Componente --------------------------------- */

export function Protocols() {
  const {
    data: protocols,
    live,
    refetch,
  } = useApiResource<Protocol[]>("/api/protocols", FALLBACK_PROTOCOLS, {
    pollMs: 10000,
  })

  const { data: summary } = useApiResource<ProtocolsSummary>(
    "/api/protocols/summary",
    FALLBACK_SUMMARY,
    { pollMs: 10000 },
  )

  const { run, busy } = useApiAction()

  const [statusFilter, setStatusFilter] = useState<ProtocolStatus | "all">(
    "all",
  )

  const [slaFilter, setSlaFilter] = useState<SlaState | "all">("all")

  const [expanded, setExpanded] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)

  const [form, setForm] = useState({
    title: "",
    machineId: "",
    priority: "medium" as ProtocolPriority,
    origin: "Inspeção de rotina",
    description: "",
  })

  const filtered = protocols.filter(
    (p) =>
      (statusFilter === "all" || p.status === statusFilter) &&
      (slaFilter === "all" || p.sla === slaFilter),
  )

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      refetch()
    } catch {
      /* backend offline */
    }
  }

  const advance = (id: string) =>
    act(() => run("POST", `/api/protocols/${id}/advance`, {}))

  const addComment = (id: string) =>
    act(() =>
      run("POST", `/api/protocols/${id}/events`, {
        type: "comentário",
        actor: "Operador EMS",
        note: "Acompanhamento registrado.",
      }),
    )

  const create = () => {
    if (!form.title.trim()) return

    act(() => run("POST", "/api/protocols", { ...form }))

    setForm({
      title: "",
      machineId: "",
      priority: "medium",
      origin: "Inspeção de rotina",
      description: "",
    })

    setShowForm(false)
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-5 py-5 space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-[#1F2A37]">
              Módulo protocolar — tratativa de ocorrências
            </h1>
            {live ? (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-green-50 text-[#16A34A]">
                backend online
              </span>
            ) : (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                offline · fallback
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Cada anomalia gera um protocolo numerado (EMS-AAAA-NNNN) com ciclo
            de vida auditável, SLA, responsável e evidências — o elo final do
            ciclo <b>medir → entender → monetizar → agir → comprovar</b>.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-3 py-1.5 rounded text-[11px] font-semibold text-white"
          style={{ backgroundColor: "#BC0202" }}
        >
          {showForm ? "Cancelar" : "Abrir protocolo"}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: "Protocolos", v: summary.total, c: "#1F2A37" },

          { l: "Em aberto", v: summary.open, c: "#D97706" },

          { l: "SLA violado", v: summary.bySla.breached, c: "#BC0202" },

          { l: "Críticos abertos", v: summary.criticalOpen, c: "#BC0202" },
        ].map((k) => (
          <div
            key={k.l}
            className="bg-white border border-gray-200 rounded p-3.5"
          >
            <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
              {k.l}
            </div>
            <div
              className="font-mono text-xl font-semibold mt-1 tabular-nums"
              style={{ color: k.c }}
            >
              {k.v}
            </div>
          </div>
        ))}
      </div>
      {/* Formulário de abertura */}
      {showForm && (
        <div className="bg-white border border-gray-200 rounded p-4 space-y-3">
          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
            Abrir novo protocolo
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-[9px] text-gray-400 uppercase">Título</span>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex.: Variação de tensão no quadro QD-D"
                className="px-2 py-1.5 rounded border border-gray-200 text-[11px] focus:outline-none focus:border-[#BC0202]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[9px] text-gray-400 uppercase">
                Máquina
              </span>
              <input
                value={form.machineId}
                onChange={(e) =>
                  setForm({ ...form, machineId: e.target.value })
                }
                placeholder="CNC-01"
                className="px-2 py-1.5 rounded border border-gray-200 text-[11px] font-mono focus:outline-none focus:border-[#BC0202]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[9px] text-gray-400 uppercase">
                Prioridade
              </span>
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm({
                    ...form,
                    priority: e.target.value as ProtocolPriority,
                  })
                }
                className="px-2 py-1.5 rounded border border-gray-200 text-[11px] focus:outline-none focus:border-[#BC0202]"
              >
                {(Object.keys(PRIORITY_LABELS) as ProtocolPriority[]).map(
                  (p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-[9px] text-gray-400 uppercase">Origem</span>
              <select
                value={form.origin}
                onChange={(e) => setForm({ ...form, origin: e.target.value })}
                className="px-2 py-1.5 rounded border border-gray-200 text-[11px] focus:outline-none focus:border-[#BC0202]"
              >
                {[
                  "Alerta automático",
                  "Inspeção de rotina",
                  "Solicitação do cliente",
                  "Auditoria",
                  "Manutenção preventiva",
                  "Outro",
                ].map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-[9px] text-gray-400 uppercase">
                Descrição
              </span>
              <input
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Evidência e contexto da ocorrência"
                className="px-2 py-1.5 rounded border border-gray-200 text-[11px] focus:outline-none focus:border-[#BC0202]"
              />
            </label>
          </div>
          <button
            onClick={create}
            disabled={busy}
            className="px-3 py-1.5 rounded text-[11px] font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: "#BC0202" }}
          >
            {busy ? "Abrindo…" : "Abrir protocolo"}
          </button>
        </div>
      )}
      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[9px] text-gray-400 uppercase font-semibold tracking-wider mr-1">
          Status
        </span>
        {([
          "all",
          "open",
          "in_progress",
          "pending_validation",
          "closed",
        ] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-2.5 py-1 rounded border text-[10px] font-medium transition-colors ${
              statusFilter === s
                ? "text-white"
                : "text-gray-600 bg-white border-gray-200 hover:bg-gray-50"
            }`}
            style={
              statusFilter === s
                ? {
                    backgroundColor:
                      s === "all"
                        ? "#1F2A37"
                        : STATUS_STYLE[(s as ProtocolStatus)].fg,
                    borderColor: "transparent",
                  }
                : undefined
            }
          >
            {s === "all" ? "Todos" : STATUS_LABELS[(s as ProtocolStatus)]}
          </button>
        ))}
        <span className="text-[9px] text-gray-400 uppercase font-semibold tracking-wider ml-2 mr-1">
          SLA
        </span>
        {(["all", "breached", "at_risk", "running", "met"] as const).map(
          (s) => (
            <button
              key={s}
              onClick={() => setSlaFilter(s)}
              className={`px-2.5 py-1 rounded border text-[10px] font-medium transition-colors ${
                slaFilter === s
                  ? "text-white"
                  : "text-gray-600 bg-white border-gray-200 hover:bg-gray-50"
              }`}
              style={
                slaFilter === s
                  ? {
                      backgroundColor:
                        s === "all" ? "#1F2A37" : SLA_STYLE[(s as SlaState)].fg,
                      borderColor: "transparent",
                    }
                  : undefined
              }
            >
              {s === "all" ? "Todos" : SLA_STYLE[(s as SlaState)].label}
            </button>
          ),
        )}
      </div>
      {/* Lista de protocolos */}
      <div className="bg-white border border-gray-200 rounded divide-y divide-gray-50">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-[11px] text-gray-400">
            Nenhum protocolo para os filtros selecionados.
          </div>
        ) : (
          filtered.map((p) => {
            const st = STATUS_STYLE[p.status]

            const sla = SLA_STYLE[p.sla]

            const isOpen = expanded === p.id

            return (
              <div key={p.id}>
                <button
                  onClick={() => setExpanded(isOpen ? null : p.id)}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50/60 transition-colors"
                >
                  <span
                    className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: PRIORITY_STYLE[p.priority] }}
                    title={`Prioridade ${PRIORITY_LABELS[p.priority]}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] text-gray-400">
                        {p.id}
                      </span>
                      <span className="text-[11px] font-semibold text-[#1F2A37] truncate">
                        {p.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[9px] text-gray-400">
                      <span>
                        {p.machine || "—"}{" "}
                        <span className="font-mono">{p.machineId}</span>
                      </span>
                      <span className="text-gray-300">·</span>
                      <span>{p.origin}</span>
                      <span className="text-gray-300">·</span>
                      <span>{PRIORITY_LABELS[p.priority]}</span>
                      <span className="text-gray-300">·</span>
                      <span>SLA {p.slaHours}h</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ color: st.fg, backgroundColor: st.bg }}
                    >
                      {STATUS_LABELS[p.status]}
                    </span>
                    <span
                      className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ color: sla.fg, backgroundColor: sla.bg }}
                    >
                      {sla.label}
                    </span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      className={
                        isOpen
                          ? "rotate-180 transition-transform"
                          : "transition-transform"
                      }
                    >
                      <path
                        d="M2 4l4 4 4-4"
                        stroke="#9CA3AF"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                </button>
                {isOpen && (
                  <ProtocolDetail
                    p={p}
                    busy={busy}
                    onAdvance={advance}
                    onComment={addComment}
                  />
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

/** Painel expandido de um protocolo: descrição, evidências, SLA, trilha e ações. */

function ProtocolDetail({
  p,
  busy,
  onAdvance,
  onComment,
}: {
  p: Protocol
  busy: boolean
  onAdvance: (id: string) => void
  onComment: (id: string) => void
}) {
  return (
    <div className="px-4 pb-4 pt-1 grid grid-cols-1 lg:grid-cols-2 gap-4 bg-gray-50/40">
      <div className="space-y-3">
        <div className="bg-white rounded border border-gray-100 p-3">
          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
            Descrição
          </div>
          <p className="text-[11px] text-gray-700 leading-relaxed">
            {p.description || "—"}
          </p>
        </div>
        <div className="bg-white rounded border border-gray-100 p-3">
          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
            Evidências
          </div>
          {p.evidence.length === 0 ? (
            <div className="text-[10px] text-gray-400">
              Sem evidências anexadas.
            </div>
          ) : (
            <ul className="space-y-1">
              {p.evidence.map((e, i) => (
                <li key={i} className="text-[10px] text-gray-600 font-mono">
                  ▸ {e}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-white rounded border border-gray-100 p-3 text-[10px] font-mono text-gray-500 space-y-1">
          <div className="flex justify-between">
            <span>Abertura</span>
            <span className="text-gray-700">{fmtIso(p.openedAt)}</span>
          </div>
          <div className="flex justify-between">
            <span>Prazo (SLA {p.slaHours}h)</span>
            <span className="text-gray-700">{fmtIso(p.deadline)}</span>
          </div>
          <div className="flex justify-between">
            <span>Encerramento</span>
            <span className="text-gray-700">{fmtIso(p.closedAt)}</span>
          </div>
          <div className="flex justify-between">
            <span>Responsável</span>
            <span className="text-gray-700">{p.assignee}</span>
          </div>
          {p.alertId && (
            <div className="flex justify-between">
              <span>Alerta origem</span>
              <span className="text-gray-700">{p.alertId}</span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="bg-white rounded border border-gray-100 p-3">
          <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Trilha de auditoria
          </div>
          <ol className="space-y-2">
            {p.events.map((ev, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-4 shrink-0 text-center text-[10px] text-[#BC0202]">
                  {EVENT_ICON[ev.type] ?? "·"}
                </span>
                <div className="flex-1">
                  <div className="text-[10px] text-gray-700">
                    <b className="capitalize">{ev.type}</b> · {ev.actor}
                  </div>
                  <div className="text-[10px] text-gray-500 leading-tight">
                    {ev.note}
                  </div>
                  <div className="text-[9px] text-gray-400 font-mono">
                    {fmtIso(ev.at)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
        {p.status !== "closed" && p.status !== "cancelled" && (
          <div className="flex gap-2">
            <button
              onClick={() => onAdvance(p.id)}
              disabled={busy}
              className="px-3 py-1.5 rounded text-[11px] font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: "#BC0202" }}
            >
              Avançar ciclo
            </button>
            <button
              onClick={() => onComment(p.id)}
              disabled={busy}
              className="px-3 py-1.5 rounded text-[11px] font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-60"
            >
              Registrar acompanhamento
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default Protocols
