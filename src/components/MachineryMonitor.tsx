import { useState } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import { useApiResource } from "../lib/api"

type MachineState = "OFF" | "IDLE" | "RUNNING" | "ANOMALY"

interface Machine {
  id: string
  name: string
  type: string
  sector: string
  state: MachineState
  voltage: number
  current: number
  power: number
  pOff: number
  pRun: number
  consumption: number
  temperature: number
  powerFactor: number
  idleMinutes?: number
  idleCostDay?: number
  coverage: number
  lastUpdate: string
  anomalyDesc?: string
}

/** Fallback local — usado apenas quando o backend está indisponível. */
const fallbackMachines: Machine[] = [
  {
    id: "INJ-01",
    name: "Injetora Engel 480T",
    type: "Injetora",
    sector: "Setor A",
    state: "RUNNING",
    voltage: 381,
    current: 42.3,
    power: 28.4,
    pOff: 2,
    pRun: 12,
    consumption: 312.7,
    temperature: 68,
    powerFactor: 0.92,
    coverage: 98,
    lastUpdate: "14:30",
  },
  {
    id: "INJ-02",
    name: "Injetora Krauss 350T",
    type: "Injetora",
    sector: "Setor A",
    state: "IDLE",
    voltage: 374,
    current: 18.1,
    power: 6.8,
    pOff: 2,
    pRun: 18,
    consumption: 487.2,
    temperature: 52,
    powerFactor: 0.79,
    idleMinutes: 47,
    idleCostDay: 412,
    coverage: 94,
    lastUpdate: "14:31",
  },
  {
    id: "COMP-01",
    name: "Compressor Atlas 75kW",
    type: "Compressor",
    sector: "Setor B",
    state: "RUNNING",
    voltage: 383,
    current: 38.7,
    power: 24.9,
    pOff: 3,
    pRun: 15,
    consumption: 287.4,
    temperature: 62,
    powerFactor: 0.94,
    coverage: 99,
    lastUpdate: "14:30",
  },
  {
    id: "COMP-02",
    name: "Compressor Schulz 55kW",
    type: "Compressor",
    sector: "Setor B",
    state: "ANOMALY",
    voltage: 362,
    current: 78.4,
    power: 51.2,
    pOff: 2,
    pRun: 12,
    consumption: 621.8,
    temperature: 97,
    powerFactor: 0.68,
    coverage: 91,
    lastUpdate: "14:28",
    anomalyDesc: "Sobrecorrente · Temp. crítica (97°C)",
  },
  {
    id: "PRENSA-01",
    name: "Prensa Hidráulica 200T",
    type: "Prensa",
    sector: "Setor C",
    state: "RUNNING",
    voltage: 380,
    current: 29.1,
    power: 18.6,
    pOff: 1,
    pRun: 10,
    consumption: 198.3,
    temperature: 55,
    powerFactor: 0.91,
    coverage: 99,
    lastUpdate: "14:32",
  },
  {
    id: "PRENSA-02",
    name: "Prensa Excêntrica 80T",
    type: "Prensa",
    sector: "Setor C",
    state: "IDLE",
    voltage: 376,
    current: 11.4,
    power: 4.2,
    pOff: 1,
    pRun: 10,
    consumption: 356.1,
    temperature: 44,
    powerFactor: 0.82,
    idleMinutes: 23,
    idleCostDay: 280,
    coverage: 99,
    lastUpdate: "14:31",
  },
  {
    id: "CNC-01",
    name: "Torno CNC Romi GL-240",
    type: "CNC",
    sector: "Setor D",
    state: "RUNNING",
    voltage: 382,
    current: 22.8,
    power: 14.7,
    pOff: 1,
    pRun: 8,
    consumption: 143.6,
    temperature: 47,
    powerFactor: 0.95,
    coverage: 99,
    lastUpdate: "14:32",
  },
  {
    id: "CNC-02",
    name: "Centro de Usinagem DMG 60",
    type: "CNC",
    sector: "Setor D",
    state: "ANOMALY",
    voltage: 355,
    current: 91.2,
    power: 57.8,
    pOff: 1,
    pRun: 8,
    consumption: 742.3,
    temperature: 103,
    powerFactor: 0.61,
    coverage: 88,
    lastUpdate: "14:27",
    anomalyDesc: "Fuga de corrente · Subtensão (355V)",
  },
  {
    id: "CNC-03",
    name: "Fresadora CNC Mazak QT",
    type: "CNC",
    sector: "Setor D",
    state: "IDLE",
    voltage: 379,
    current: 9.2,
    power: 3.1,
    pOff: 1,
    pRun: 8,
    consumption: 98.4,
    temperature: 38,
    powerFactor: 0.88,
    idleMinutes: 68,
    idleCostDay: 892,
    coverage: 91,
    lastUpdate: "14:30",
  },
  {
    id: "CNC-04",
    name: "Torno CNC Okuma LB-3000",
    type: "CNC",
    sector: "Setor D",
    state: "OFF",
    voltage: 0,
    current: 0,
    power: 0,
    pOff: 1,
    pRun: 8,
    consumption: 0,
    temperature: 22,
    powerFactor: 0,
    coverage: 100,
    lastUpdate: "12:00",
  },
]

const stateConfig: Record<MachineState, {
  label: string
  color: string
  bg: string
  border: string
  dot: string
}> = {
  RUNNING: {
    label: "RUNNING",
    color: "#16A34A",
    bg: "bg-green-50",
    border: "border-[#16A34A]",
    dot: "bg-[#16A34A]",
  },
  IDLE: {
    label: "IDLE",
    color: "#D97706",
    bg: "bg-amber-50",
    border: "border-[#D97706]",
    dot: "bg-[#D97706]",
  },
  OFF: {
    label: "OFF",
    color: "#9CA3AF",
    bg: "bg-gray-50",
    border: "border-gray-300",
    dot: "bg-gray-400",
  },
  ANOMALY: {
    label: "ANOMALIA",
    color: "#BC0202",
    bg: "bg-red-50",
    border: "border-[#BC0202]",
    dot: "bg-[#BC0202]",
  },
}

// Simulated 24h load curve per machine
function makeLoadCurve(state: MachineState, pOff: number, pRun: number) {
  return Array.from({ length: 24 }, (_, h) => {
    let base = pOff
    if (state === "RUNNING")
      base = h >= 6 && h < 22 ? pRun + (Math.random() - 0.5) * 4 : pOff
    if (state === "IDLE")
      base =
        h >= 6 && h < 22
          ? pOff + (pRun - pOff) * 0.4 + (Math.random() - 0.5) * 1
          : pOff
    if (state === "ANOMALY") base = pRun * 1.6 + (Math.random() - 0.5) * 8
    return { h: `${h}h`, p: Math.max(0, +base.toFixed(1)) }
  })
}

function MachineCard({ m, onOpen }: { m: Machine; onOpen: () => void }) {
  const cfg = stateConfig[m.state]
  const curve = makeLoadCurve(m.state, m.pOff, m.pRun)

  return (
    <div
      className={`bg-white rounded overflow-hidden border border-l-[3px] ${cfg.border} border-gray-200`}
    >
      {/* State header */}
      <div
        className={`${cfg.bg} px-4 py-2.5 flex items-center justify-between`}
      >
        <div>
          <div className="text-xs font-bold text-[#1F2A37] leading-tight">
            {m.name}
          </div>
          <div className="text-[9px] text-gray-400 font-mono mt-0.5">
            {m.id} · {m.sector}
          </div>
        </div>
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold"
          style={{ borderColor: cfg.color, color: cfg.color }}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${
              m.state !== "OFF" ? "animate-pulse" : ""
            }`}
          />
          {cfg.label}
        </div>
      </div>

      {/* Anomaly / IDLE alert bar */}
      {m.state === "ANOMALY" && (
        <div
          className="px-4 py-1.5 flex items-center gap-2 text-[10px] font-semibold text-white"
          style={{ backgroundColor: "#BC0202" }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M5 1L0.5 9.5H9.5L5 1Z"
              stroke="white"
              strokeWidth="1.2"
              fill="none"
            />
            <path
              d="M5 4V6M5 7.5H5.01"
              stroke="white"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
          {m.anomalyDesc}
        </div>
      )}
      {m.state === "IDLE" && m.idleMinutes && (
        <div
          className="px-4 py-1.5 flex items-center justify-between text-[10px] font-semibold"
          style={{ backgroundColor: "#FEF3C7" }}
        >
          <span className="text-amber-800">
            IDLE há {m.idleMinutes} min · Consumo sem produção
          </span>
          <span className="font-mono text-amber-700">
            R$ {m.idleCostDay?.toLocaleString("pt-BR")}/dia
          </span>
        </div>
      )}

      {/* Mini sparkline */}
      <div className="px-4 pt-2 pb-0">
        <div className="text-[9px] text-gray-400 mb-1">
          Curva de carga — 24h (kW)
        </div>
        <ResponsiveContainer width="100%" height={48}>
          <AreaChart
            data={curve}
            margin={{ top: 2, right: 0, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id={`g${m.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={cfg.color} stopOpacity={0.2} />
                <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="h" hide />
            <YAxis hide domain={[0, m.pRun * 2]} />
            <ReferenceLine
              y={m.pRun}
              stroke="#E5E5E5"
              strokeDasharray="3 2"
              strokeWidth={1}
            />
            <ReferenceLine
              y={m.pOff}
              stroke="#E5E5E5"
              strokeDasharray="2 2"
              strokeWidth={1}
            />
            <Area
              type="monotone"
              dataKey="p"
              stroke={cfg.color}
              strokeWidth={1.5}
              fill={`url(#g${m.id})`}
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Params grid */}
      <div className="px-4 pt-2 pb-3 grid grid-cols-3 gap-2">
        {[
          {
            label: "Tensão",
            val: m.state === "OFF" ? "—" : `${m.voltage}`,
            unit: "V",
            warn: m.voltage > 0 && (m.voltage < 370 || m.voltage > 390),
          },
          {
            label: "Corrente",
            val: m.state === "OFF" ? "—" : m.current.toFixed(1),
            unit: "A",
            warn: m.current > 65,
          },
          {
            label: "Potência",
            val: m.state === "OFF" ? "—" : m.power.toFixed(1),
            unit: "kW",
            warn: m.power > m.pRun * 1.4,
          },
          {
            label: "Consumo",
            val: m.state === "OFF" ? "0" : m.consumption.toFixed(0),
            unit: "kWh",
            warn: false,
          },
          {
            label: "Temp.",
            val: `${m.temperature}`,
            unit: "°C",
            warn: m.temperature > 80,
          },
          {
            label: "FP",
            val: m.state === "OFF" ? "—" : m.powerFactor.toFixed(2),
            unit: "",
            warn: m.powerFactor > 0 && m.powerFactor < 0.85,
          },
        ].map(({ label, val, unit, warn }) => (
          <div key={label} className="text-center">
            <div className="text-[8px] text-gray-400 uppercase tracking-wide">
              {label}
            </div>
            <div
              className={`font-mono text-[13px] font-semibold tabular-nums leading-snug ${
                warn
                  ? m.state === "ANOMALY"
                    ? "text-[#BC0202]"
                    : "text-[#D97706]"
                  : "text-[#1F2A37]"
              }`}
            >
              {val}
              <span className="text-[9px] text-gray-400 font-normal ml-0.5">
                {unit}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Coverage + action */}
      <div className="px-4 pb-3 flex items-center justify-between">
        <span className="text-[9px] text-gray-400 font-mono">
          Cobertura {m.coverage}% · {m.lastUpdate}
        </span>
        <button
          onClick={onOpen}
          className="px-3 py-1.5 rounded text-[10px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "#BC0202" }}
        >
          Ver Máquina
        </button>
      </div>
    </div>
  )
}

function MachineDetail({ m, onClose }: { m: Machine; onClose: () => void }) {
  const cfg = stateConfig[m.state]
  const curve = makeLoadCurve(m.state, m.pOff, m.pRun)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded shadow-2xl w-full max-w-xl mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ backgroundColor: "#BC0202" }}
        >
          <div>
            <div className="text-white font-bold text-sm">{m.name}</div>
            <div className="text-red-200 text-[10px] font-mono">
              {m.id} · {m.type} · {m.sector}
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 3L13 13M13 3L3 13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          {/* State + IDLE cost */}
          <div
            className={`flex items-center justify-between px-3 py-2 rounded border ${cfg.border} ${cfg.bg}`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${cfg.dot} animate-pulse`}
              />
              <span
                className="text-xs font-semibold"
                style={{ color: cfg.color }}
              >
                {cfg.label}
              </span>
              {m.anomalyDesc && (
                <span className="text-xs text-gray-600">— {m.anomalyDesc}</span>
              )}
            </div>
            {m.state === "IDLE" && m.idleCostDay && (
              <span className="font-mono text-xs font-bold text-amber-700">
                R$ {m.idleCostDay.toLocaleString("pt-BR")}/dia IDLE
              </span>
            )}
          </div>

          {/* Load curve */}
          <div>
            <div className="text-[10px] text-gray-500 mb-2 font-semibold uppercase tracking-wider">
              Curva de carga — 24h
            </div>
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart
                data={curve}
                margin={{ top: 4, right: 4, left: -14, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="detailG" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={cfg.color}
                      stopOpacity={0.15}
                    />
                    <stop offset="95%" stopColor={cfg.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#F0F0F0"
                  vertical={false}
                />
                <XAxis
                  dataKey="h"
                  tick={{ fontSize: 9, fill: "#9CA3AF" }}
                  tickLine={false}
                  axisLine={false}
                  interval={3}
                />
                <YAxis
                  tick={{
                    fontSize: 9,
                    fill: "#9CA3AF",
                    fontFamily: "JetBrains Mono",
                  }}
                  tickLine={false}
                  axisLine={false}
                />
                <ReferenceLine
                  y={m.pRun}
                  stroke="#E5E5E5"
                  strokeDasharray="3 2"
                  label={{
                    value: `P_run ${m.pRun}kW`,
                    fontSize: 9,
                    fill: "#9CA3AF",
                  }}
                />
                <ReferenceLine
                  y={m.pOff}
                  stroke="#F0F0F0"
                  strokeDasharray="2 2"
                  label={{
                    value: `P_off ${m.pOff}kW`,
                    fontSize: 9,
                    fill: "#9CA3AF",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="p"
                  stroke={cfg.color}
                  strokeWidth={1.5}
                  fill="url(#detailG)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Params */}
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Tensão", m.voltage, "V"],
              ["Corrente", m.current, "A"],
              ["Potência", m.power, "kW"],
              ["Consumo", m.consumption.toFixed(0), "kWh"],
              ["Temperatura", m.temperature, "°C"],
              ["Fat. Potência", m.powerFactor.toFixed(2), ""],
            ].map(([l, v, u]) => (
              <div
                key={String(l)}
                className="bg-gray-50 rounded p-3 text-center"
              >
                <div className="text-[9px] text-gray-400 uppercase tracking-wide">
                  {l}
                </div>
                <div className="font-mono text-sm font-semibold text-[#1F2A37] tabular-nums mt-1">
                  {String(v)}
                  <span className="text-[9px] text-gray-400 ml-0.5">{u}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Recommended action */}
          {m.state !== "OFF" && m.state !== "RUNNING" && (
            <div
              className={`rounded p-3 text-xs border ${
                m.state === "ANOMALY"
                  ? "bg-red-50 border-red-200"
                  : "bg-amber-50 border-amber-200"
              }`}
            >
              <div
                className={`font-semibold mb-1 ${
                  m.state === "ANOMALY" ? "text-[#BC0202]" : "text-amber-800"
                }`}
              >
                {m.state === "ANOMALY"
                  ? "Intervenção Imediata"
                  : "Recomendação — Consumo Improdutivo"}
              </div>
              <p
                className={`leading-relaxed ${
                  m.state === "ANOMALY" ? "text-red-700" : "text-amber-700"
                }`}
              >
                {m.state === "ANOMALY"
                  ? "Acionar equipe de manutenção imediatamente. Verificar isolamento elétrico, contatores e relés de proteção."
                  : `Verificar se a máquina pode ser desligada ao fim do turno. IDLE há ${m.idleMinutes} min = R$ ${m.idleCostDay?.toLocaleString("pt-BR")} estimado/dia em consumo sem produção.`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function MachineryMonitor() {
  const [filter, setFilter] = useState<MachineState | "all">("all")
  const [detailId, setDetailId] = useState<string | null>(null)

  // Estados e anomalias são calculados pelo backend a partir da telemetria.
  const { data: machines, live } = useApiResource<Machine[]>(
    "/api/machines",
    fallbackMachines,
    { pollMs: 5000 },
  )

  const filtered =
    filter === "all" ? machines : machines.filter((m) => m.state === filter)
  const detail = machines.find((m) => m.id === detailId)

  const counts = {
    all: machines.length,
    RUNNING: machines.filter((m) => m.state === "RUNNING").length,
    IDLE: machines.filter((m) => m.state === "IDLE").length,
    ANOMALY: machines.filter((m) => m.state === "ANOMALY").length,
    OFF: machines.filter((m) => m.state === "OFF").length,
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-5 py-5 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm font-semibold text-[#1F2A37]">
            Máquinas — Planta SP Guarulhos
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {machines.length} equipamentos ·
            <span style={{ color: "#16A34A" }} className="font-medium">
              {" "}
              {counts.RUNNING} RUNNING
            </span>{" "}
            ·
            <span style={{ color: "#D97706" }} className="font-medium">
              {" "}
              {counts.IDLE} IDLE
            </span>{" "}
            ·
            <span style={{ color: "#BC0202" }} className="font-medium">
              {" "}
              {counts.ANOMALY} ANOMALIA
            </span>{" "}
            ·
            <span className="text-gray-400 font-medium"> {counts.OFF} OFF</span>
            {live && (
              <span className="text-[#16A34A] font-medium">
                {" "}
                · telemetria ao vivo
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {(["all", "RUNNING", "IDLE", "ANOMALY", "OFF"] as const).map((f) => {
            const labels: Record<string, string> = {
              all: "Todos",
              RUNNING: "Running",
              IDLE: "Idle",
              ANOMALY: "Anomalia",
              OFF: "Off",
            }
            const colors: Record<string, string> = {
              all: "#1F2A37",
              RUNNING: "#16A34A",
              IDLE: "#D97706",
              ANOMALY: "#BC0202",
              OFF: "#9CA3AF",
            }
            const isActive = filter === f
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded border text-[11px] font-medium transition-colors`}
                style={
                  isActive
                    ? {
                        backgroundColor: colors[f],
                        color: "white",
                        borderColor: colors[f],
                      }
                    : {
                        backgroundColor: "white",
                        color: "#6B7280",
                        borderColor: "#E0E0E0",
                      }
                }
              >
                {labels[f]} (
                {f === "all" ? counts.all : counts[(f as MachineState)]})
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {filtered.map((m) => (
          <MachineCard key={m.id} m={m} onOpen={() => setDetailId(m.id)} />
        ))}
      </div>

      {detail && <MachineDetail m={detail} onClose={() => setDetailId(null)} />}
    </div>
  )
}
