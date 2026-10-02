import { useState } from "react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine,
  Legend,
  BarChart,
  Bar,
  Cell,
} from "recharts"
import { useApiResource, useApiAction } from "../lib/api"
import type { Economy } from "../lib/types"

// Fallback local DETERMINÍSTICO: CUSUM de 28 dias — economia acumulada após intervenção no dia 8.
// (Sem Math.random(): a demonstração deve ser reprodutível.)
const dnoise = (i: number) => {
  const x = Math.sin((i + 1) * 12.9898) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

const fallbackCusum = Array.from({ length: 28 }, (_, i) => {
  const day = i + 1
  const interv = day >= 8
  const eco = interv
    ? Math.max(0, (day - 7) * 43.7 + dnoise(i) * 30)
    : Math.max(0, dnoise(i) * 25)
  return {
    dia: day,
    economy: +eco.toFixed(0),
    baseline: 580 + Math.sin(i * 0.4) * 30,
    medido: interv
      ? 540 + Math.sin(i * 0.4) * 25 - (day - 7) * 1.8
      : 578 + Math.sin(i * 0.4) * 40,
  }
})

// Fallback local — top oportunidades
const fallbackOpportunities = [
  {
    machine: "Fresadora CNC Mazak QT",
    machineId: "CNC-03",
    sector: "Setor D",
    type: "IDLE prolongado",
    costDay: 892,
    costMonth: 19624,
    costYear: 235488,
    action: "Desligar fora de turno",
    confidence: "alta",
  },
  {
    machine: "Centro de Usinagem DMG 60",
    machineId: "CNC-02",
    sector: "Setor D",
    type: "Anomalia elétrica",
    costDay: 640,
    costMonth: 14080,
    costYear: 168960,
    action: "Manutenção elétrica imediata",
    confidence: "alta",
  },
  {
    machine: "Injetora Krauss 350T",
    machineId: "INJ-02",
    sector: "Setor A",
    type: "IDLE + FP baixo",
    costDay: 412,
    costMonth: 9064,
    costYear: 108768,
    action: "Capacitor + controle de turno",
    confidence: "média",
  },
  {
    machine: "Compressor Schulz 55kW",
    machineId: "COMP-02",
    sector: "Setor B",
    type: "Sobrecarga contínua",
    costDay: 380,
    costMonth: 8360,
    costYear: 100320,
    action: "Manutenção preventiva",
    confidence: "alta",
  },
  {
    machine: "Prensa Excêntrica 80T",
    machineId: "PRENSA-02",
    sector: "Setor C",
    type: "IDLE + variação V",
    costDay: 280,
    costMonth: 6160,
    costYear: 73920,
    action: "Verificar QD-C + turno",
    confidence: "média",
  },
]

// Fallback local — intervenções monetizadas
const fallbackInterventions = [
  {
    id: "INT-014",
    date: "22/09",
    machine: "COMP-01",
    desc: "Ajuste temporização",
    before: 621,
    after: 543,
    saved: 78,
    period: "22–30/set",
    confidence: "estimado",
    status: "active",
  },
  {
    id: "INT-013",
    date: "18/09",
    machine: "INJ-01",
    desc: "Troca de resistência de aquecimento",
    before: 498,
    after: 441,
    saved: 57,
    period: "18–30/set",
    confidence: "observado",
    status: "active",
  },
  {
    id: "INT-012",
    date: "10/09",
    machine: "PRENSA-01",
    desc: "Lubrificação + alinhamento",
    before: 312,
    after: 287,
    saved: 25,
    period: "10–30/set",
    confidence: "estimado",
    status: "active",
  },
]

const confColor = { alta: "#16A34A", média: "#D97706", baixa: "#BC0202" }

const TooltipCusum = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded shadow-lg px-3 py-2 text-xs">
      <div className="font-semibold text-[#1F2A37] mb-1.5">Dia {label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: p.color }}
          />
          <span className="text-gray-600">{p.name}:</span>
          <span
            className="font-mono font-semibold tabular-nums"
            style={{ color: p.color }}
          >
            {p.dataKey === "economy" ? `R$ ${p.value}` : `${p.value} kWh`}
          </span>
        </div>
      ))}
    </div>
  )
}

const FALLBACK_ECONOMY: Economy = {
  cusum: fallbackCusum,
  opportunities: fallbackOpportunities,
  interventions: fallbackInterventions,
  totals: {
    savingsAccumulated: 0,
    opportunityMonth: 0,
    activeSavings: 0,
    tariff: {
      offPeak: 0.42,
      intermediate: 0.78,
      peak: 2.21,
      contractedDemandKW: 480,
      excessDemandPenalty: 45.8,
    },
  },
}

export function Economia() {
  const [view, setView] = useState<"cusum" | "opportunities" | "events">(
    "cusum",
  )
  const [form, setForm] = useState({
    machine: "CNC-01",
    before: "200",
    after: "150",
    desc: "",
  })

  // Dados de economia (CUSUM, oportunidades, intervenções) vêm do backend.
  const { data: economy, refetch } = useApiResource<Economy>(
    "/api/economy",
    FALLBACK_ECONOMY,
    { pollMs: 30000 },
  )
  const { run, busy } = useApiAction()
  const { cusum: cusumData, opportunities, interventions } = economy

  const totalEco = cusumData[cusumData.length - 1].economy
  const totalOpportunity = opportunities.reduce((s, o) => s + o.costMonth, 0)
  const totalActive = interventions.reduce((s, i) => s + i.saved, 0)

  const registerIntervention = async () => {
    try {
      await run("POST", "/api/economy/interventions", {
        machine: form.machine,
        before: Number(form.before) || 0,
        after: Number(form.after) || 0,
        desc: form.desc || "Intervenção registrada",
      })
      setForm((f) => ({ ...f, desc: "" }))
      refetch()
    } catch {
      /* backend offline: mantém dados atuais */
    }
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-5 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm font-semibold text-[#1F2A37]">
            Economia — Antes × Depois
          </h1>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Baseline por regressão · CUSUM acumulado · Oportunidades monetizadas
          </p>
        </div>
        <div className="flex gap-1">
          {([
            ["cusum", "CUSUM / Baseline"],
            ["opportunities", "Oportunidades"],
            ["events", "Intervenções"],
          ] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded text-[11px] font-medium transition-colors ${
                view === v
                  ? "text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
              }`}
              style={view === v ? { backgroundColor: "#BC0202" } : {}}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <div
          className="bg-white rounded border border-t-2 border-gray-200 p-4"
          style={{ borderTopColor: "#BC0202" }}
        >
          <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">
            Economia CUSUM (set)
          </div>
          <div className="font-mono text-2xl font-semibold text-[#BC0202] tabular-nums">
            R$ {totalEco.toLocaleString("pt-BR")}
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            ≈ 1.227 kWh · nível de confiança: estimado
          </div>
        </div>
        <div
          className="bg-white rounded border border-t-2 border-gray-200 p-4"
          style={{ borderTopColor: "#D97706" }}
        >
          <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">
            Oportunidade identificada
          </div>
          <div className="font-mono text-2xl font-semibold text-[#D97706] tabular-nums">
            R$ {totalOpportunity.toLocaleString("pt-BR")}/mês
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            Se todas as anomalias forem corrigidas agora
          </div>
        </div>
        <div
          className="bg-white rounded border border-t-2 border-gray-200 p-4"
          style={{ borderTopColor: "#16A34A" }}
        >
          <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">
            Economia comprovada ativa
          </div>
          <div className="font-mono text-2xl font-semibold text-[#16A34A] tabular-nums">
            R$ {totalActive.toLocaleString("pt-BR")}/dia
          </div>
          <div className="text-[10px] text-gray-500 mt-1">
            {interventions.length} intervenções registradas em set/2026
          </div>
        </div>
      </div>

      {/* CUSUM view */}
      {view === "cusum" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Baseline vs medido */}
            <div className="bg-white rounded border border-gray-200 p-5">
              <h2 className="text-xs font-semibold text-[#1F2A37] mb-1">
                Consumo Diário: Medido × Esperado (baseline)
              </h2>
              <p className="text-[10px] text-gray-500 mb-4">
                kWh/dia · Baseline = a + b × unidades produzidas · Intervenção
                no dia 8
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart
                  data={cusumData}
                  margin={{ top: 4, right: 4, left: -14, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#F0F0F0"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="dia"
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
                    domain={[480, 640]}
                  />
                  <Tooltip content={<TooltipCusum />} />
                  <Legend
                    iconType="line"
                    iconSize={14}
                    wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
                  />
                  <ReferenceLine
                    x={8}
                    stroke="#BC0202"
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                    label={{
                      value: "Intervenção",
                      fontSize: 9,
                      fill: "#BC0202",
                      position: "insideTopLeft",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="medido"
                    name="Medido"
                    stroke="#BC0202"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="baseline"
                    name="Esperado (baseline)"
                    stroke="#9CA3AF"
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* CUSUM acumulado */}
            <div className="bg-white rounded border border-gray-200 p-5">
              <h2 className="text-xs font-semibold text-[#1F2A37] mb-1">
                CUSUM — Economia Acumulada
              </h2>
              <p className="text-[10px] text-gray-500 mb-4">
                CUSUM_t = Σ(E_esperado_i − E_medido_i) · Total acumulado:{" "}
                <strong className="text-[#BC0202]">
                  R$ {totalEco.toLocaleString("pt-BR")}
                </strong>
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart
                  data={cusumData}
                  margin={{ top: 4, right: 4, left: -14, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="ecoGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="#BC0202"
                        stopOpacity={0.12}
                      />
                      <stop
                        offset="95%"
                        stopColor="#BC0202"
                        stopOpacity={0.01}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#F0F0F0"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="dia"
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
                    tickFormatter={(v) => `R$${v}`}
                  />
                  <Tooltip
                    formatter={(v: any) => [`R$ ${v}`, "Economia acumulada"]}
                    contentStyle={{ fontSize: 11, borderRadius: 4 }}
                  />
                  <ReferenceLine
                    x={8}
                    stroke="#BC0202"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                    label={{
                      value: "Intervenção",
                      fontSize: 9,
                      fill: "#BC0202",
                      position: "insideTopLeft",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="economy"
                    name="Economia acumulada"
                    stroke="#BC0202"
                    strokeWidth={2}
                    fill="url(#ecoGrad)"
                    dot={false}
                    activeDot={{ r: 3, fill: "#BC0202" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* IPMVP methodology note */}
          <div className="bg-[#1F2A37] rounded p-4 text-xs text-white/80">
            <div className="text-white font-semibold mb-2 text-[11px]">
              Metodologia de medição e verificação (IPMVP — Opção B)
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[10px]">
              <div>
                <div className="text-white/50 uppercase tracking-wider text-[9px] mb-1">
                  Baseline
                </div>
                Medição contínua por máquina antes da intervenção. Ajustado por
                produção:{" "}
                <span className="font-mono text-white">E = β₀ + β₁·prod</span>
              </div>
              <div>
                <div className="text-white/50 uppercase tracking-wider text-[9px] mb-1">
                  Economia diária
                </div>
                E_baseline − E_medido (ajustado). CUSUM acumula e revela
                deslocamento persistente via Shewhart / EWMA.
              </div>
              <div>
                <div className="text-white/50 uppercase tracking-wider text-[9px] mb-1">
                  Nível de confiança
                </div>
                <span className="text-[#16A34A] font-semibold">Observado</span>:
                ≥14 dias pós-intervenção ·
                <span className="text-[#D97706] font-semibold ml-1">
                  Estimado
                </span>
                : &lt;14 dias ·
                <span className="text-gray-400 font-semibold ml-1">
                  Normalizado
                </span>
                : ajuste de produção aplicado
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Opportunities view */}
      {view === "opportunities" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded border border-gray-200 p-5">
              <h2 className="text-xs font-semibold text-[#1F2A37] mb-4">
                Top 5 Oportunidades de Economia
              </h2>
              <div className="space-y-3">
                {opportunities.map((o, i) => (
                  <div key={o.machineId} className="flex items-start gap-3">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 mt-0.5"
                      style={{
                        backgroundColor:
                          i === 0 ? "#BC0202" : i === 1 ? "#D97706" : "#9CA3AF",
                      }}
                    >
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-[#1F2A37] truncate">
                          {o.machine}
                        </div>
                        <div className="font-mono text-xs font-bold text-[#BC0202] tabular-nums shrink-0 ml-2">
                          R$ {o.costMonth.toLocaleString("pt-BR")}/mês
                        </div>
                      </div>
                      <div className="text-[9px] text-gray-400 font-mono">
                        {o.machineId} · {o.sector} · {o.type}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] text-gray-600">
                          {o.action}
                        </span>
                        <span
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{
                            color:
                              confColor[
                                (o.confidence as keyof typeof confColor)
                              ],
                            backgroundColor: `${confColor[(o.confidence as keyof typeof confColor)]}15`,
                          }}
                        >
                          Conf. {o.confidence}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded border border-gray-200 p-5">
              <h2 className="text-xs font-semibold text-[#1F2A37] mb-4">
                Potencial anual por máquina (R$)
              </h2>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={opportunities}
                  layout="vertical"
                  margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#F0F0F0"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tick={{
                      fontSize: 9,
                      fill: "#9CA3AF",
                      fontFamily: "JetBrains Mono",
                    }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="machineId"
                    tick={{ fontSize: 10, fill: "#6B7280" }}
                    tickLine={false}
                    axisLine={false}
                    width={60}
                  />
                  <Tooltip
                    formatter={(v: any) => [
                      `R$ ${v.toLocaleString("pt-BR")}`,
                      "Potencial/ano",
                    ]}
                    contentStyle={{ fontSize: 11, borderRadius: 4 }}
                  />
                  <Bar
                    dataKey="costYear"
                    name="Potencial/ano"
                    radius={[0, 2, 2, 0]}
                  >
                    {opportunities.map((_, i) => (
                      <Cell
                        key={i}
                        fill={
                          i === 0 ? "#BC0202" : i === 1 ? "#D97706" : "#9CA3AF"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Events view */}
      {view === "events" && (
        <div className="bg-white rounded border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-xs font-semibold text-[#1F2A37]">
              Registro de Intervenções — Antes × Depois
            </h2>
            <p className="text-[10px] text-gray-500">
              Gestor registra ação → sistema compara baseline × pós-intervenção
            </p>
          </div>

          {/* Registrar intervenção (POST /api/economy/interventions) */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-end gap-2 flex-wrap bg-gray-50/60">
            <label className="flex flex-col gap-1">
              <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">
                Máquina
              </span>
              <input
                value={form.machine}
                onChange={(e) => setForm({ ...form, machine: e.target.value })}
                className="px-2 py-1 rounded border border-gray-200 text-[11px] w-28 font-mono focus:outline-none focus:border-[#BC0202]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">
                Descrição
              </span>
              <input
                value={form.desc}
                onChange={(e) => setForm({ ...form, desc: e.target.value })}
                placeholder="Ex.: Troca de rolamento"
                className="px-2 py-1 rounded border border-gray-200 text-[11px] w-56 focus:outline-none focus:border-[#BC0202]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">
                Antes (kWh/dia)
              </span>
              <input
                type="number"
                value={form.before}
                onChange={(e) => setForm({ ...form, before: e.target.value })}
                className="px-2 py-1 rounded border border-gray-200 text-[11px] w-24 font-mono focus:outline-none focus:border-[#BC0202]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">
                Depois (kWh/dia)
              </span>
              <input
                type="number"
                value={form.after}
                onChange={(e) => setForm({ ...form, after: e.target.value })}
                className="px-2 py-1 rounded border border-gray-200 text-[11px] w-24 font-mono focus:outline-none focus:border-[#BC0202]"
              />
            </label>
            <button
              onClick={registerIntervention}
              disabled={busy}
              className="px-3 py-1.5 rounded text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ backgroundColor: "#BC0202" }}
            >
              {busy ? "Registrando…" : "Registrar intervenção"}
            </button>
            <span className="text-[10px] text-gray-400 ml-auto font-mono hidden lg:inline">
              POST /api/economy/interventions
            </span>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-[9px] text-gray-400 uppercase tracking-wider">
                <th className="text-left px-4 py-2 font-semibold">ID</th>
                <th className="text-left px-4 py-2 font-semibold">Data</th>
                <th className="text-left px-4 py-2 font-semibold">Máquina</th>
                <th className="text-left px-4 py-2 font-semibold">Descrição</th>
                <th className="text-right px-4 py-2 font-semibold">
                  Antes (kWh/dia)
                </th>
                <th className="text-right px-4 py-2 font-semibold">
                  Depois (kWh/dia)
                </th>
                <th className="text-right px-4 py-2 font-semibold">
                  Economia/dia
                </th>
                <th className="text-left px-4 py-2 font-semibold">Período</th>
                <th className="text-left px-4 py-2 font-semibold">Confiança</th>
              </tr>
            </thead>
            <tbody>
              {interventions.map((iv, idx) => (
                <tr
                  key={iv.id}
                  className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    idx % 2 === 0 ? "" : "bg-gray-50/50"
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-[10px] text-gray-400">
                    {iv.id}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{iv.date}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-[#1F2A37]">
                    {iv.machine}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{iv.desc}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-500 tabular-nums">
                    {iv.before}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[#16A34A] tabular-nums font-semibold">
                    {iv.after}
                  </td>
                  <td
                    className="px-4 py-3 text-right font-mono font-bold tabular-nums"
                    style={{ color: "#BC0202" }}
                  >
                    −{iv.saved} kWh
                  </td>
                  <td className="px-4 py-3 text-[10px] text-gray-500 font-mono">
                    {iv.period}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${
                        iv.confidence === "observado"
                          ? "bg-green-50 text-[#16A34A]"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {iv.confidence}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
