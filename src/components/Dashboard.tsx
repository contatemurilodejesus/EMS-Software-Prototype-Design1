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
import type { Summary } from "../lib/types"

/** Fallbacks locais — usados quando o backend está indisponível. */
const fallbackConsumption = [
  { time: "00h", consumo: 312, limite: 480 },
  { time: "01h", consumo: 287, limite: 480 },
  { time: "02h", consumo: 265, limite: 480 },
  { time: "03h", consumo: 251, limite: 480 },
  { time: "04h", consumo: 274, limite: 480 },
  { time: "05h", consumo: 318, limite: 480 },
  { time: "06h", consumo: 402, limite: 480 },
  { time: "07h", consumo: 456, limite: 480 },
  { time: "08h", consumo: 491, limite: 480 },
  { time: "09h", consumo: 510, limite: 480 },
  { time: "10h", consumo: 498, limite: 480 },
  { time: "11h", consumo: 475, limite: 480 },
  { time: "12h", consumo: 388, limite: 480 },
  { time: "13h", consumo: 421, limite: 480 },
  { time: "14h", consumo: 467, limite: 480 },
  { time: "15h", consumo: 502, limite: 480 },
  { time: "16h", consumo: 488, limite: 480 },
  { time: "17h", consumo: 445, limite: 480 },
  { time: "18h", consumo: 391, limite: 480 },
  { time: "19h", consumo: 352, limite: 480 },
  { time: "20h", consumo: 328, limite: 480 },
  { time: "21h", consumo: 305, limite: 480 },
  { time: "22h", consumo: 298, limite: 480 },
  { time: "Agora", consumo: 321, limite: 480 },
]

const fallbackSectors = [
  {
    id: "A",
    name: "Setor A — Injeção",
    machines: 4,
    running: 2,
    idle: 1,
    off: 1,
    anomaly: 0,
    kwh: 3420,
    cost: 6293,
    idleCost: 412,
    coverage: 97,
  },
  {
    id: "B",
    name: "Setor B — Compressores",
    machines: 3,
    running: 1,
    idle: 1,
    off: 1,
    anomaly: 1,
    kwh: 2180,
    cost: 4011,
    idleCost: 623,
    coverage: 94,
  },
  {
    id: "C",
    name: "Setor C — Prensas",
    machines: 3,
    running: 2,
    idle: 1,
    off: 0,
    anomaly: 0,
    kwh: 1960,
    cost: 3606,
    idleCost: 280,
    coverage: 99,
  },
  {
    id: "D",
    name: "Setor D — CNC / Usinagem",
    machines: 4,
    running: 1,
    idle: 1,
    off: 2,
    anomaly: 1,
    kwh: 4367,
    cost: 8035,
    idleCost: 892,
    coverage: 91,
  },
]

const FALLBACK_SUMMARY: Summary = {
  plant: {
    id: "SP-GRU",
    name: "Planta SP — Guarulhos",
    demandLimitKW: 480,
    timezone: "America/Sao_Paulo",
  },
  demandLimitKW: 480,
  totals: {
    kwh: 11927,
    cost: 21945,
    idleCost: 2207,
    idleMachines: 3,
    running: 6,
    anomaly: 2,
    off: 2,
    alerts: 6,
  },
  sectors: fallbackSectors,
  consumption: fallbackConsumption,
  dataQuality: [
    { label: "GOOD", value: 91.4, color: "#16A34A" },
    { label: "MISSING", value: 4.1, color: "#9CA3AF" },
    { label: "OUTLIER", value: 3.2, color: "#D97706" },
    { label: "DUPLICATE", value: 1.3, color: "#BC0202" },
  ],
  gateways: [
    {
      id: "GW-SP01",
      label: "Gateway SP-01",
      status: "online",
      sub: "MQTT · TLS · 14 sensores",
    },
    {
      id: "GW-SP02",
      label: "Broker MQTT",
      status: "online",
      sub: "QoS 1 · Latência: 42ms",
    },
    {
      id: "GW-SP03",
      label: "TimescaleDB",
      status: "online",
      sub: "1.2 M leituras hoje",
    },
    {
      id: "GW-SP04",
      label: "Motor analítico",
      status: "warning",
      sub: "Baseline regressão pendente",
    },
  ],
  nonMonitoredKwhDay: 580,
  livePower: "321.0",
  timestamp: "30/09/2026 14:32",
}

const StateBar = ({
  running,
  idle,
  off,
  total,
}: {
  running: number
  idle: number
  off: number
  total: number
}) => (
  <div className="flex rounded-full overflow-hidden h-2 w-full gap-px">
    <div className="bg-[#16A34A]" style={{ flex: running / total }} />
    <div className="bg-[#D97706]" style={{ flex: idle / total }} />
    <div className="bg-[#D1D5DB]" style={{ flex: off / total }} />
  </div>
)

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-[#1F2A37] mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#BC0202]" />
        <span className="text-gray-600">Consumo:</span>
        <span className="font-mono font-semibold text-[#BC0202]">
          {payload[0]?.value} kW
        </span>
      </div>
    </div>
  )
}

export function Dashboard() {
  const [period, setPeriod] = useState<"24h" | "7d" | "30d">("24h")

  // KPIs, setores, curva de consumo, qualidade e gateways vêm do backend (/api/summary).
  const { data: summary, live } = useApiResource<Summary>(
    "/api/summary",
    FALLBACK_SUMMARY,
    { pollMs: 10000 },
  )
  const { totals, sectors, dataQuality, gateways } = summary
  const consumptionData = summary.consumption.map((p) => ({
    ...p,
    limite: summary.demandLimitKW,
  }))
  const peakDemand = Math.max(...summary.consumption.map((p) => p.consumo), 0)
  const peakLimitPct = Math.round((peakDemand / summary.demandLimitKW) * 100)

  const totalKwh = totals.kwh
  const totalCost = totals.cost
  const totalIdleCost = totals.idleCost
  const idleMachines = totals.idleMachines

  return (
    <div className="max-w-screen-2xl mx-auto px-5 py-5 space-y-5">
      {/* Title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-[#1F2A37]">
            Visão da Fábrica — {summary.plant.name}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Atualizado {summary.timestamp} · Carga ativa: {summary.livePower} kW
            · Ciclo: 5 min
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 text-xs font-medium ${
              live ? "text-[#16A34A]" : "text-gray-400"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                live ? "bg-[#16A34A] animate-pulse" : "bg-gray-400"
              }`}
            />
            {live
              ? "Gateway online · dados ao vivo"
              : "Gateway offline · dados de demonstração"}
          </span>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Consumo Total Hoje",
            value: totalKwh.toLocaleString("pt-BR"),
            unit: "kWh",
            sub: `R$ ${totalCost.toLocaleString("pt-BR")} estimado`,
            topColor: "#1F2A37",
            icon: (
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path
                  d="M8 1.5L3 8h4.5L6 13.5L12 7H7.5L8 1.5Z"
                  stroke="#6B7280"
                  strokeWidth="1.3"
                  fill="none"
                  strokeLinejoin="round"
                />
              </svg>
            ),
          },
          {
            label: "Demanda de Pico",
            value: peakDemand.toLocaleString("pt-BR"),
            unit: "kW",
            sub: `${peakLimitPct}% da demanda contratada (${summary.demandLimitKW} kW)`,
            topColor: "#BC0202",
            icon: (
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path
                  d="M2 11L5.5 7l3 3L13 4"
                  stroke="#6B7280"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ),
          },
          {
            label: "Custo IDLE (desperdício)",
            value: `R$ ${totalIdleCost.toLocaleString("pt-BR")}`,
            unit: "/dia",
            sub: `${idleMachines} máquinas em IDLE agora`,
            topColor: "#D97706",
            icon: (
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <circle
                  cx="7.5"
                  cy="7.5"
                  r="5.5"
                  stroke="#6B7280"
                  strokeWidth="1.3"
                />
                <path
                  d="M7.5 4.5V7.5L9.5 9.5"
                  stroke="#6B7280"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            ),
          },
          {
            label: "Fator de Potência Médio",
            value: "0,87",
            unit: "fp",
            sub: "Meta: ≥ 0,92 · Reativo excedente detectado",
            topColor: "#D97706",
            icon: (
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                <path
                  d="M2 11L5.5 7l3 3L13 4"
                  stroke="#6B7280"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 4h3v3"
                  stroke="#6B7280"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ),
          },
        ].map(({ label, value, unit, sub, topColor, icon }) => (
          <div
            key={label}
            className={`bg-white rounded border border-gray-200 border-t-2 p-4`}
            style={{ borderTopColor: topColor }}
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider leading-tight">
                {label}
              </span>
              {icon}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-xl font-semibold text-[#1F2A37] tabular-nums leading-none">
                {value}
              </span>
              <span className="text-xs text-gray-500">{unit}</span>
            </div>
            <p className="mt-1.5 text-[10px] text-gray-500 leading-tight">
              {sub}
            </p>
          </div>
        ))}
      </div>

      {/* Chart + Sectors side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Consumption chart — takes 2 cols */}
        <div className="lg:col-span-2 bg-white rounded border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xs font-semibold text-[#1F2A37]">
                Consumo Real vs. Limite Contratado ({summary.demandLimitKW} kW)
              </h2>
              <p className="text-[10px] text-gray-500 mt-0.5">
                Demanda ativa — ciclo horário
              </p>
            </div>
            <div className="flex gap-1">
              {(["24h", "7d", "30d"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                    period === p
                      ? "text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                  style={period === p ? { backgroundColor: "#BC0202" } : {}}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 mb-3">
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span className="w-4 h-0.5 bg-[#BC0202] inline-block" />
              Consumo real (kW)
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <span className="w-4 inline-block border-t-2 border-dashed border-gray-400" />
              Limite contratado
            </div>
            <div className="ml-auto flex items-center gap-1 text-[10px] font-medium text-[#BC0202] bg-red-50 px-2 py-0.5 rounded">
              ▲ Ultrapassagem 09h–10h (+30 kW)
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={consumptionData}
              margin={{ top: 4, right: 4, left: -14, bottom: 0 }}
            >
              <defs>
                <linearGradient id="cGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#BC0202" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#BC0202" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#F0F0F0"
                vertical={false}
              />
              <XAxis
                dataKey="time"
                tick={{
                  fontSize: 9,
                  fill: "#9CA3AF",
                  fontFamily: "JetBrains Mono",
                }}
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
                domain={[0, 560]}
              />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine
                y={summary.demandLimitKW}
                stroke="#9CA3AF"
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
              <Area
                type="monotone"
                dataKey="consumo"
                name="Consumo"
                stroke="#BC0202"
                strokeWidth={2}
                fill="url(#cGrad)"
                dot={false}
                activeDot={{ r: 3, fill: "#BC0202" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Sector ranking */}
        <div className="bg-white rounded border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-[#1F2A37] mb-1">
            Ranking de Consumo por Setor
          </h2>
          <p className="text-[10px] text-gray-500 mb-4">
            kWh e custo IDLE hoje
          </p>
          <div className="space-y-4">
            {[...sectors]
              .sort((a, b) => b.kwh - a.kwh)
              .map((s) => (
                <div key={s.id}>
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <div className="text-xs font-medium text-[#1F2A37] leading-tight">
                        {s.name}
                      </div>
                      <div className="text-[9px] text-gray-400 mt-0.5 font-mono">
                        <span className="text-[#16A34A]">
                          {s.running} RUNNING
                        </span>
                        {" · "}
                        <span className="text-[#D97706]">{s.idle} IDLE</span>
                        {" · "}
                        <span className="text-gray-400">{s.off} OFF</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs font-semibold text-[#1F2A37] tabular-nums">
                        {s.kwh.toLocaleString("pt-BR")} kWh
                      </div>
                      {s.idleCost > 0 && (
                        <div className="text-[9px] text-[#D97706] font-mono font-medium">
                          R$ {s.idleCost.toLocaleString("pt-BR")} IDLE
                        </div>
                      )}
                    </div>
                  </div>
                  <StateBar
                    running={s.running}
                    idle={s.idle}
                    off={s.off}
                    total={s.machines}
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-[9px] text-gray-400">
                      Cobertura: {s.coverage}%
                    </span>
                    <span className="text-[9px] text-gray-500 font-mono">
                      R$ {s.cost.toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>
              ))}
          </div>

          {/* Legend */}
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
            {[
              ["#16A34A", "RUNNING"],
              ["#D97706", "IDLE"],
              ["#D1D5DB", "OFF"],
            ].map(([color, label]) => (
              <div
                key={label}
                className="flex items-center gap-1 text-[9px] text-gray-500"
              >
                <span
                  className="w-2 h-2 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom summary: non-monitored + data quality */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-amber-50 border border-amber-200 rounded p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-[#D97706]" />
            <span className="text-xs font-semibold text-amber-800">
              Carga não monitorada
            </span>
          </div>
          <div className="font-mono text-xl font-semibold text-amber-700">
            ~{summary.nonMonitoredKwhDay} kWh/dia
          </div>
          <p className="text-[10px] text-amber-600 mt-1 leading-tight">
            Iluminação, climatização, cargas de escritório — sem medidores
            individuais
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded p-4">
          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">
            Qualidade dos dados
          </div>
          <div className="space-y-1.5">
            {dataQuality.map(({ label, value, color }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="font-mono text-[9px] w-16 text-gray-500">
                  {label}
                </span>
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${value}%`, backgroundColor: color }}
                  />
                </div>
                <span
                  className="font-mono text-[10px] font-semibold tabular-nums"
                  style={{ color }}
                >
                  {value.toLocaleString("pt-BR", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                  %
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded p-4">
          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">
            Gateway / Infraestrutura
          </div>
          <div className="space-y-2">
            {gateways.map(({ id, label, status, sub }) => (
              <div key={id} className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-[#1F2A37]">
                    {label}
                  </div>
                  <div className="text-[9px] text-gray-400 font-mono">
                    {sub}
                  </div>
                </div>
                <span
                  className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                    status === "online"
                      ? "bg-green-50 text-[#16A34A]"
                      : "bg-amber-50 text-[#D97706]"
                  }`}
                >
                  {status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
