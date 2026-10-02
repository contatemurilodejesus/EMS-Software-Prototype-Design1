import { useState } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import { useApiResource } from "../lib/api"
import type { Reports as ReportsData } from "../lib/types"

/** Fallbacks locais — usados quando o backend está indisponível. */
const fallbackShiftData = [
  { month: "Abr", turnoA: 142800, turnoB: 128400, turnoC: 87200 },
  { month: "Mai", turnoA: 151200, turnoB: 132100, turnoC: 89400 },
  { month: "Jun", turnoA: 148700, turnoB: 135800, turnoC: 91200 },
  { month: "Jul", turnoA: 155400, turnoB: 139200, turnoC: 93800 },
  { month: "Ago", turnoA: 161200, turnoB: 141700, turnoC: 88900 },
  { month: "Set", turnoA: 157800, turnoB: 138400, turnoC: 90300 },
]

const fallbackCostTrend = [
  { month: "Abr", custo: 89420, meta: 85000 },
  { month: "Mai", custo: 94110, meta: 85000 },
  { month: "Jun", custo: 92380, meta: 88000 },
  { month: "Jul", custo: 97240, meta: 88000 },
  { month: "Ago", custo: 101560, meta: 90000 },
  { month: "Set", custo: 98320, meta: 90000 },
]

const fallbackMachineBreakdown = [
  { name: "CNC-02", value: 742, fill: "#BC0202" },
  { name: "COMP-02", value: 622, fill: "#D97706" },
  { name: "INJ-02", value: 487, fill: "#F59E0B" },
  { name: "PRENSA-02", value: 356, fill: "#6B7280" },
  { name: "INJ-01", value: 313, fill: "#9CA3AF" },
  { name: "Outros", value: 408, fill: "#D1D5DB" },
]

const fallbackTariffProfile = [
  { h: "00h", r: 0.42 },
  { h: "02h", r: 0.42 },
  { h: "04h", r: 0.42 },
  { h: "06h", r: 0.78 },
  { h: "08h", r: 1.84 },
  { h: "10h", r: 1.84 },
  { h: "12h", r: 1.84 },
  { h: "14h", r: 1.84 },
  { h: "16h", r: 1.84 },
  { h: "18h", r: 2.21 },
  { h: "20h", r: 2.21 },
  { h: "22h", r: 0.78 },
]

const BarTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded shadow-lg p-2.5 text-xs">
      <div className="font-semibold text-[#1F2A37] mb-1.5">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <span
            className="w-2 h-2 rounded-sm"
            style={{ backgroundColor: p.fill || p.color }}
          />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-mono font-semibold tabular-nums text-gray-900">
            {p.value.toLocaleString("pt-BR")} kWh
          </span>
        </div>
      ))}
    </div>
  )
}

const LineTip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded shadow-lg p-2.5 text-xs">
      <div className="font-semibold text-[#1F2A37] mb-1.5">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <span
            className="w-3 h-0.5 inline-block"
            style={{ backgroundColor: p.color }}
          />
          <span className="text-gray-600">{p.name}:</span>
          <span
            className="font-mono font-semibold tabular-nums"
            style={{ color: p.color }}
          >
            R$ {p.value.toLocaleString("pt-BR")}
          </span>
        </div>
      ))}
    </div>
  )
}

const FALLBACK_REPORTS: ReportsData = {
  shiftData: fallbackShiftData,
  costTrend: fallbackCostTrend,
  machineBreakdown: fallbackMachineBreakdown,
  tariffProfile: fallbackTariffProfile,
  tariff: {
    offPeak: 0.42,
    intermediate: 0.78,
    peak: 2.21,
    contractedDemandKW: 480,
    excessDemandPenalty: 45.8,
  },
}

export function Reports() {
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month")

  // Séries analíticas servidas pelo backend (/api/reports).
  const { data: reports } = useApiResource<ReportsData>(
    "/api/reports",
    FALLBACK_REPORTS,
  )
  const { shiftData, costTrend, machineBreakdown, tariffProfile } = reports

  /** Exportação simples (CSV) — sem infraestrutura pesada, conforme o plano técnico. */
  const exportCsv = () => {
    const rows: string[][] = [["secao", "chave", "valor", "valor2", "valor3"]]
    shiftData.forEach((r) =>
      rows.push([
        "consumo_turno",
        r.month,
        String(r.turnoA),
        String(r.turnoB),
        String(r.turnoC),
      ]),
    )
    costTrend.forEach((r) =>
      rows.push(["custo_meta", r.month, String(r.custo), String(r.meta), ""]),
    )
    machineBreakdown.forEach((r) =>
      rows.push(["top_consumidores", r.name, String(r.value), "", ""]),
    )
    tariffProfile.forEach((r) =>
      rows.push(["perfil_tarifario", r.h, String(r.r), "", ""]),
    )
    rows.push(["tarifa", "offPeak", String(reports.tariff.offPeak), "", ""])
    rows.push([
      "tarifa",
      "intermediate",
      String(reports.tariff.intermediate),
      "",
      "",
    ])
    rows.push(["tarifa", "peak", String(reports.tariff.peak), "", ""])
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n")
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `energymatrix-relatorio-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-5 py-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm font-semibold text-[#1F2A37]">
            Relatórios — Análise Financeira
          </h1>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Consumo por turno, custos tarifários e exportação corporativa
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(["month", "quarter", "year"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded text-[11px] font-medium transition-colors ${
                  period === p
                    ? "text-white"
                    : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
                }`}
                style={period === p ? { backgroundColor: "#BC0202" } : {}}
              >
                {p === "month" ? "Mês" : p === "quarter" ? "Trimestre" : "Ano"}
              </button>
            ))}
          </div>
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path
                d="M5.5 1V8M5.5 8L3 5.5M5.5 8L8 5.5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M1 10H10"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
            Exportar CSV
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-semibold text-white"
            style={{ backgroundColor: "#BC0202" }}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path
                d="M5.5 1V8M5.5 8L3 5.5M5.5 8L8 5.5"
                stroke="white"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M1 10H10"
                stroke="white"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
            Imprimir / PDF
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Consumo Total (Set)",
            value: "386.500",
            unit: "kWh",
            note: "+3,8% vs. Ago",
            warn: true,
          },
          {
            label: "Custo Estimado (Set)",
            value: "R$ 98.320",
            unit: "",
            note: "+8,6% vs. meta orçamentária",
            warn: true,
          },
          {
            label: "Demanda Contratada",
            value: `${reports.tariff.contractedDemandKW} kW`,
            unit: "",
            note: "2 ultrapassagens no mês",
            warn: true,
          },
          {
            label: "Potencial de Redução",
            value: "R$ 12.400",
            unit: "/mês",
            note: "Correção FP + IDLE + turno C",
            warn: false,
          },
        ].map(({ label, value, unit, note, warn }) => (
          <div
            key={label}
            className="bg-white rounded border border-gray-200 p-4"
          >
            <div className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">
              {label}
            </div>
            <div className="font-mono text-lg font-semibold text-[#1F2A37] tabular-nums leading-none">
              {value}
              <span className="text-xs text-gray-400 font-normal ml-0.5">
                {unit}
              </span>
            </div>
            <div
              className={`mt-1 text-[10px] font-medium ${
                warn ? "text-[#D97706]" : "text-[#16A34A]"
              }`}
            >
              {warn ? "▲" : "▼"} {note}
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-[#1F2A37] mb-1">
            Consumo por Turno (kWh)
          </h2>
          <p className="text-[10px] text-gray-500 mb-4">
            Comparativo mensal — últimos 6 meses
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart
              data={shiftData}
              barGap={2}
              margin={{ top: 0, right: 4, left: -14, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#F0F0F0"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 9, fill: "#9CA3AF" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{
                  fontSize: 9,
                  fill: "#9CA3AF",
                  fontFamily: "JetBrains Mono",
                }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<BarTip />} />
              <Legend
                iconType="square"
                iconSize={7}
                wrapperStyle={{ fontSize: 9, paddingTop: 8 }}
              />
              <Bar
                dataKey="turnoA"
                name="Turno A (06–14h)"
                fill="#BC0202"
                radius={[2, 2, 0, 0]}
              />
              <Bar
                dataKey="turnoB"
                name="Turno B (14–22h)"
                fill="#D97706"
                radius={[2, 2, 0, 0]}
              />
              <Bar
                dataKey="turnoC"
                name="Turno C (22–06h)"
                fill="#9CA3AF"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-[#1F2A37] mb-1">
            Custo de Energia vs. Meta
          </h2>
          <p className="text-[10px] text-gray-500 mb-4">
            Custo mensal (R$) — últimos 6 meses
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart
              data={costTrend}
              margin={{ top: 4, right: 4, left: -10, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#F0F0F0"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 9, fill: "#9CA3AF" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{
                  fontSize: 9,
                  fill: "#9CA3AF",
                  fontFamily: "JetBrains Mono",
                }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<LineTip />} />
              <Legend
                iconType="line"
                iconSize={14}
                wrapperStyle={{ fontSize: 9, paddingTop: 8 }}
              />
              <Line
                type="monotone"
                dataKey="custo"
                name="Custo Real"
                stroke="#BC0202"
                strokeWidth={2}
                dot={{ r: 2.5, fill: "#BC0202" }}
              />
              <Line
                type="monotone"
                dataKey="meta"
                name="Meta"
                stroke="#9CA3AF"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Donut + tariff */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-[#1F2A37] mb-1">
            Consumo por Máquina
          </h2>
          <p className="text-[10px] text-gray-500 mb-2">
            Distribuição percentual do turno
          </p>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie
                data={machineBreakdown}
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={68}
                dataKey="value"
                paddingAngle={2}
              >
                {machineBreakdown.map((e, i) => (
                  <Cell key={i} fill={e.fill} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: any) => [`${v} kWh`, ""]}
                contentStyle={{ fontSize: 10, borderRadius: 4 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1 mt-1">
            {machineBreakdown.map((m) => (
              <div
                key={m.name}
                className="flex items-center justify-between text-[10px]"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-sm"
                    style={{ backgroundColor: m.fill }}
                  />
                  <span className="text-gray-600 font-mono">{m.name}</span>
                </div>
                <span className="font-mono font-semibold text-gray-700 tabular-nums">
                  {m.value} kWh
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-[#1F2A37] mb-1">
            Perfil Tarifário Horário (R$/kWh)
          </h2>
          <p className="text-[10px] text-gray-500 mb-3">
            Desloque cargas IDLE de horário de ponta para fora de ponta
          </p>
          <div className="flex items-center gap-4 mb-3 flex-wrap">
            {[
              ["#D1D5DB", "Fora de ponta: R$ 0,42"],
              ["#F59E0B", "Intermediário: R$ 0,78"],
              ["#BC0202", "Ponta: R$ 2,21"],
            ].map(([c, l]) => (
              <div
                key={l}
                className="flex items-center gap-1 text-[9px] text-gray-500"
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: c as string }}
                />
                {l}
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart
              data={tariffProfile}
              margin={{ top: 0, right: 4, left: -12, bottom: 0 }}
            >
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
              />
              <YAxis
                tick={{
                  fontSize: 9,
                  fill: "#9CA3AF",
                  fontFamily: "JetBrains Mono",
                }}
                tickLine={false}
                axisLine={false}
                domain={[0, 2.5]}
                tickFormatter={(v) => `R$${v.toFixed(2)}`}
              />
              <Tooltip
                formatter={(v: any) => [`R$ ${v.toFixed(2)}/kWh`, "Tarifa"]}
                contentStyle={{ fontSize: 10, borderRadius: 4 }}
              />
              <Bar dataKey="r" radius={[2, 2, 0, 0]}>
                {tariffProfile.map((d, i) => (
                  <Cell
                    key={i}
                    fill={
                      d.r >= 2
                        ? "#BC0202"
                        : d.r >= 1.5
                          ? "#D97706"
                          : d.r >= 0.7
                            ? "#F59E0B"
                            : "#D1D5DB"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Export docs */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { label: "Relatório Mensal (Set/2026)", size: "284 KB" },
                { label: "Análise de Demanda Q3", size: "412 KB" },
                { label: "Relatório de Anomalias", size: "196 KB" },
              ].map((r) => (
                <button
                  key={r.label}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-gray-200 text-[10px] text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  <div
                    className="w-5 h-6 rounded text-[8px] font-bold text-white flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "#BC0202" }}
                  >
                    PDF
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-[#1F2A37]">{r.label}</div>
                    <div className="text-[9px] text-gray-400">{r.size}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
