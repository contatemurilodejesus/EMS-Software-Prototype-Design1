import { useMemo, useState } from "react"

import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"

import { useApiResource, useApiAction } from "../lib/api"

import { LogoFull } from "./Logo"

import type {
  CompetitionStatus,
  DemoMachine,
  ScenarioId,
  TelemetryPoint,
  MachineState,
  DemoAnalytics,
} from "../lib/types"

/** Ordem e rótulos do roteiro de demonstração (Documento Técnico, seção 8). */

const SCENARIO_ORDER: ScenarioId[] = [
  "NORMAL",
  "IDLE",
  "ANOMALY",
  "THERMAL",
  "OFFLINE",
  "RECOVERY",
]

const SCENARIO_HELP: Record<ScenarioId, {
  machine: string
  what: string
  proves: string
}> = {
  NORMAL: {
    machine: "M-001 / M-002 / M-003",
    what: "Operação estável nas bandas esperadas",
    proves: "Estabelecer a referência",
  },

  IDLE: {
    machine: "M-001",
    what: "Consumo sem produção identificada",
    proves: "IDLE + kWh + R$",
  },

  ANOMALY: {
    machine: "M-002",
    what: "Potência acima da baseline (+50%)",
    proves: "Desvio + alerta explicável",
  },

  THERMAL: {
    machine: "M-002",
    what: "Temperatura acima do limite (≥ 85 °C)",
    proves: "Alerta térmico persistente",
  },

  OFFLINE: {
    machine: "M-003",
    what: "Ausência de telemetria (MISSING)",
    proves: "Detecção de dados ausentes",
  },

  RECOVERY: {
    machine: "M-001",
    what: "Redução de 30% após intervenção",
    proves: "ANTES × DEPOIS",
  },
}

const STATE_STYLE: Record<MachineState, {
  label: string
  color: string
  bg: string
}> = {
  RUNNING: { label: "RUNNING", color: "#16A34A", bg: "#ECFDF5" },

  IDLE: { label: "IDLE", color: "#D97706", bg: "#FFFBEB" },

  OFF: { label: "OFF", color: "#9CA3AF", bg: "#F3F4F6" },

  ANOMALY: { label: "ANOMALIA", color: "#BC0202", bg: "#FEF2F2" },
}

const brl = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`

const num = (v: number, d = 1) =>
  v.toLocaleString("pt-BR", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  })

/** Fallback determinístico (offline) — espelha os perfis do servidor. */

const FALLBACK_MACHINES: DemoMachine[] = [
  {
    id: "M-001",
    name: "Compressor 01",
    type: "Compressor",
    sector: "Setor A",
    gateway: "GW-DEMO",
    pOff: 0.2,
    pIdle: 2,
    pRun: 8,
    baselineKw: 8,
    nominalKW: 15,
    state: "RUNNING",
    quality: "GOOD",
    online: true,
    power: 8.6,
    voltage: 380,
    current: 15.8,
    powerFactor: 0.94,
    temperature: 43,
    consumption: 1254.7,
    deviationPct: 8,
    lastUpdate: "passo 0",
  },

  {
    id: "M-002",
    name: "Injetora 02",
    type: "Injetora",
    sector: "Setor B",
    gateway: "GW-DEMO",
    pOff: 0.3,
    pIdle: 3,
    pRun: 12,
    baselineKw: 10,
    nominalKW: 22,
    state: "RUNNING",
    quality: "GOOD",
    online: true,
    power: 12.6,
    voltage: 380,
    current: 20.8,
    powerFactor: 0.92,
    temperature: 48,
    consumption: 1318.4,
    deviationPct: 26,
    lastUpdate: "passo 0",
  },

  {
    id: "M-003",
    name: "Prensa 03",
    type: "Prensa",
    sector: "Setor C",
    gateway: "GW-DEMO",
    pOff: 0.2,
    pIdle: 1.5,
    pRun: 6,
    baselineKw: 6,
    nominalKW: 11,
    state: "RUNNING",
    quality: "GOOD",
    online: true,
    power: 6.6,
    voltage: 380,
    current: 10.4,
    powerFactor: 0.95,
    temperature: 41,
    consumption: 1042.1,
    deviationPct: 10,
    lastUpdate: "passo 0",
  },
]

const FALLBACK: CompetitionStatus = {
  simulated: true,
  deterministic: true,

  scenario: "NORMAL",
  scenarioLabel: "Normal",
  targetMachine: null,

  note: "Operação estável — referência",
  step: 0,

  scenarios: SCENARIO_ORDER.map((id) => ({
    id,
    label: id,
    target: null,
    note: SCENARIO_HELP[id].what,
  })),

  kpis: {
    energyKwh: 0,
    costBrl: 0,
    wasteKwh: 0,
    wasteBrl: 0,
    alerts: 0,
    machines: 3,
    idleMachines: 0,
    anomalyMachines: 0,
    offlineMachines: 0,
    criticalMachine: "M-001",
    criticalMachineName: "Compressor 01",
    savingsBrl: 0,
    estimated: true,
  },

  alerts: [],
  interventions: [],
  beforeAfter: null,

  machines: FALLBACK_MACHINES,

  analytics: {
    simulated: true,
    scenario: "NORMAL",
    step: 0,

    idle: {
      machines: [],
      totalIdleEnergyKwh: 0,
      totalIdleCost: 0,
      estimated: true,
    },

    anomalies: [],

    cost: {
      ratePerKwh: 0.83,
      perMachine: FALLBACK_MACHINES.map((m) => ({
        machineId: m.id,
        energyKwh: m.consumption,
        cost: Math.round(m.consumption * 0.83),
      })),
      estimated: true,
      note: "Custo estimado no cenário simulado (kWh × tarifa).",
    },
  },
}

/* ------------------------------- Subcomponentes ------------------------------- */

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string
  sub?: string
  color: string
}) {
  return (
    <div className="bg-white border border-gray-200 rounded p-3.5">
      <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
        {label}
      </div>
      <div
        className="font-mono text-xl font-semibold mt-1 tabular-nums"
        style={{ color }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">
          {sub}
        </div>
      )}
    </div>
  )
}

function MachineCard({
  m,
  target,
  onSelect,
}: {
  m: DemoMachine
  target: boolean
  onSelect: () => void
}) {
  const st = STATE_STYLE[m.state] ?? STATE_STYLE.OFF

  const dev = m.deviationPct ?? 0

  return (
    <button
      onClick={onSelect}
      className={`text-left bg-white rounded border p-3.5 transition-shadow hover:shadow-md ${
        target ? "border-[#BC0202] ring-1 ring-[#BC0202]/20" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-bold text-[#1F2A37]">
              {m.id}
            </span>
            {target && (
              <span className="text-[8px] font-bold px-1 py-px rounded bg-[#BC0202] text-white">
                ALVO
              </span>
            )}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">{m.name}</div>
        </div>
        <span
          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
          style={{ color: st.color, backgroundColor: st.bg }}
        >
          {st.label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <div>
          <div className="text-[9px] text-gray-400 uppercase">Potência</div>
          <div
            className="font-mono text-sm font-semibold tabular-nums"
            style={{ color: m.state === "ANOMALY" ? "#BC0202" : "#1F2A37" }}
          >
            {num(m.power, 1)}{" "}
            <span className="text-[9px] text-gray-400">kW</span>
          </div>
        </div>
        <div>
          <div className="text-[9px] text-gray-400 uppercase">Temp.</div>
          <div
            className="font-mono text-sm font-semibold tabular-nums"
            style={{ color: m.temperature >= 85 ? "#BC0202" : "#1F2A37" }}
          >
            {m.temperature} <span className="text-[9px] text-gray-400">°C</span>
          </div>
        </div>
        <div>
          <div className="text-[9px] text-gray-400 uppercase">FP</div>
          <div
            className="font-mono text-sm font-semibold tabular-nums"
            style={{
              color:
                (m.powerFactor || 0) < 0.85 && m.online ? "#D97706" : "#1F2A37",
            }}
          >
            {num(m.powerFactor || 0, 2)}
          </div>
        </div>
      </div>

      {/* Barra potência vs baseline */}
      <div className="mt-3">
        <div className="flex justify-between text-[9px] text-gray-400 mb-0.5">
          <span>Baseline {m.baselineKw} kW</span>
          <span
            className="font-mono"
            style={{ color: Math.abs(dev) > 30 ? "#BC0202" : "#6B7280" }}
          >
            desvio {dev > 0 ? "+" : ""}
            {dev}%
          </span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, (m.power / (m.baselineKw * 2)) * 100)}%`,
              backgroundColor: Math.abs(dev) > 30 ? "#BC0202" : "#1F2A37",
            }}
          />
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-mono text-gray-400">
        <span>kWh {num(m.consumption, 1)}</span>
        <span>V {m.voltage}</span>
        <span>A {num(m.current, 1)}</span>
        {m.idleMinutes != null && (
          <span className="text-[#D97706]">IDLE {m.idleMinutes} min</span>
        )}
        {!m.online && <span className="text-[#BC0202]">MISSING</span>}
      </div>

      {m.anomalyDesc && (
        <div className="mt-2 text-[10px] text-[#BC0202] bg-red-50 border border-red-100 rounded px-2 py-1 leading-tight">
          {m.anomalyDesc}
        </div>
      )}
    </button>
  )
}

/* --------------------------------- Componente --------------------------------- */

export function CompetitionMode() {
  // Estado do demo vem do backend (/api/competition) e se atualiza sozinho.

  const {
    data: comp,
    live,
    refetch,
  } = useApiResource<CompetitionStatus>("/api/competition", FALLBACK, {
    pollMs: 3000,
  })

  const { run, busy } = useApiAction()

  const [selected, setSelected] = useState("M-001")

  const [form, setForm] = useState({ before: "", after: "" })

  const machines = comp.machines ?? FALLBACK_MACHINES

  const analytics: DemoAnalytics | undefined = comp.analytics

  const kpis = comp.kpis

  const { data: telemetry } = useApiResource<{ points: TelemetryPoint[] }>(
    `/api/machines/${selected}/telemetry`,

    { points: [] },

    { pollMs: 3000 },
  )

  const selectedMachine = useMemo(
    () => machines.find((m) => m.id === selected) ?? machines[0],
    [machines, selected],
  )

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      refetch()
    } catch {
      /* backend offline */
    }
  }

  const activate = (scenario: ScenarioId) =>
    act(() => run("POST", "/api/demo/scenario", { scenario }))

  const reset = () => act(() => run("POST", "/api/demo/reset", {}))

  const advance = () => act(() => run("POST", "/api/demo/step", {}))

  const advanceAlert = (id: string) =>
    act(() => run("POST", `/api/alerts/${id}/advance`, {}))

  const registerIntervention = () => {
    const base = selectedMachine?.baselineKw ?? 8

    const before = Number(form.before) || Number((base * 24).toFixed(1))

    const after = Number(form.after) || Number((base * 0.7 * 24).toFixed(1))

    act(() =>
      run("POST", "/api/interventions", {
        machineId: selected,
        before,
        after,
        description: `Intervenção simulada em ${selected}`,
      }),
    )

    setForm({ before: "", after: "" })
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-5 py-5 space-y-4">
      {/* Hero / cabeçalho do demo */}
      <div className="bg-white border border-gray-200 rounded p-4 flex flex-wrap items-center gap-4">
        <LogoFull size={86} />
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-sm font-semibold text-[#1F2A37]">
              Competition Mode — demonstração determinística
            </h1>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 uppercase tracking-wider">
              Dados simulados
            </span>
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
          <p className="text-[11px] text-gray-500 mt-1 leading-tight">
            3 máquinas virtuais · cenários NORMAL, IDLE, ANOMALY, THERMAL,
            OFFLINE e RECOVERY · simulação sem hardware. Os números de energia,
            custo e economia são <b>estimativas do cenário simulado</b> — não
            representam medição industrial real.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-gray-400 uppercase tracking-wider">
            Cenário ativo
          </div>
          <div className="text-sm font-semibold text-[#BC0202]">
            {comp.scenarioLabel}
          </div>
          <div className="text-[10px] font-mono text-gray-400">
            passo {comp.step} min · {comp.targetMachine ?? "—"}
          </div>
        </div>
      </div>
      {/* Barra de controle de cenário */}
      <div className="bg-white border border-gray-200 rounded p-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2.5">
          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
            Roteiro de demonstração — ativar cenário
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={advance}
              disabled={busy}
              className="px-2.5 py-1 rounded border border-gray-200 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              Avançar +1 min
            </button>
            <button
              onClick={reset}
              disabled={busy}
              className="px-2.5 py-1 rounded border border-gray-200 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              Reiniciar demo
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {SCENARIO_ORDER.map((id, i) => {
            const help = SCENARIO_HELP[id]

            const isActive = comp.scenario === id

            return (
              <button
                key={id}
                onClick={() => activate(id)}
                disabled={busy}
                className={`text-left rounded border p-2.5 transition-colors disabled:opacity-60 ${
                  isActive
                    ? "border-[#BC0202] bg-red-50/60"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#1F2A37]">
                    {id}
                  </span>
                  <span className="text-[9px] font-mono text-gray-400">
                    {i + 1}
                  </span>
                </div>
                <div className="text-[9px] text-gray-500 mt-0.5 leading-tight">
                  {help.machine}
                </div>
                <div className="text-[9px] text-gray-400 mt-1 leading-tight">
                  {help.proves}
                </div>
              </button>
            )
          })}
        </div>
        <div className="mt-2.5 text-[10px] text-gray-400">
          <b className="text-gray-500">{comp.scenarioLabel}:</b> {comp.note}. O
          cenário é reiniciável e determinístico — a mesma execução produz os
          mesmos resultados.
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard
          label="Energia do cenário"
          value={`${kpis.energyKwh.toLocaleString("pt-BR")} kWh`}
          sub="acumulada desde a ativação"
          color="#1F2A37"
        />
        <KpiCard
          label="Custo estimado"
          value={brl(kpis.costBrl)}
          sub="kWh × tarifa · estimativa"
          color="#BC0202"
        />
        <KpiCard
          label="Desperdício (IDLE)"
          value={brl(kpis.wasteBrl)}
          sub={`${num(kpis.wasteKwh, 1)} kWh improdutivos`}
          color="#D97706"
        />
        <KpiCard
          label="Alertas abertos"
          value={String(kpis.alerts)}
          sub={`${kpis.anomalyMachines} anomalia · ${kpis.offlineMachines} offline`}
          color={kpis.alerts ? "#BC0202" : "#16A34A"}
        />
        <KpiCard
          label="Máquina crítica"
          value={kpis.criticalMachine ?? "—"}
          sub={kpis.criticalMachineName ?? "sem desvio relevante"}
          color="#1F2A37"
        />
      </div>
      {/* Máquinas + telemetria */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-3">
          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
            Máquinas simuladas
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {machines.map((m) => (
              <MachineCard
                key={m.id}
                m={m}
                target={comp.targetMachine === m.id}
                onSelect={() => setSelected(m.id)}
              />
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded p-3.5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
              Telemetria · {selected}
            </div>
            <span className="text-[9px] font-mono text-gray-400">
              kW × limite
            </span>
          </div>
          <div style={{ height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={telemetry.points}
                margin={{ top: 5, right: 5, left: -22, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#BC0202" stopOpacity={0.35} />
                    <stop
                      offset="100%"
                      stopColor="#BC0202"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                <XAxis
                  dataKey="ts"
                  tick={{ fontSize: 9, fill: "#9CA3AF" }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 9, fill: "#9CA3AF" }} />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 4,
                    border: "1px solid #E5E7EB",
                  }}
                />
                {selectedMachine && (
                  <ReferenceLine
                    y={selectedMachine.pRun}
                    stroke="#16A34A"
                    strokeDasharray="4 4"
                    label={{ value: "P_run", fontSize: 9, fill: "#16A34A" }}
                  />
                )}
                {selectedMachine && (
                  <ReferenceLine
                    y={selectedMachine.baselineKw}
                    stroke="#D97706"
                    strokeDasharray="2 3"
                    label={{ value: "baseline", fontSize: 9, fill: "#D97706" }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="powerKw"
                  name="kW"
                  stroke="#BC0202"
                  strokeWidth={1.5}
                  fill="url(#gp)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div style={{ height: 150 }} className="mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={telemetry.points}
                margin={{ top: 5, right: 5, left: -22, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
                <XAxis
                  dataKey="ts"
                  tick={{ fontSize: 9, fill: "#9CA3AF" }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 9, fill: "#9CA3AF" }} />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 4,
                    border: "1px solid #E5E7EB",
                  }}
                />
                <ReferenceLine
                  y={85}
                  stroke="#BC0202"
                  strokeDasharray="4 4"
                  label={{ value: "85 °C", fontSize: 9, fill: "#BC0202" }}
                />
                <Line
                  type="monotone"
                  dataKey="temperatureC"
                  name="°C"
                  stroke="#D97706"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[9px] text-gray-400 font-mono mt-1">
            série determinística · cenário {comp.scenario}
          </div>
        </div>
      </div>
      {/* Alertas do cenário */}
      <div className="bg-white border border-gray-200 rounded">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
            Alertas do cenário
          </div>
          <span className="text-[9px] text-gray-400 font-mono">
            ciclo ABERTO → RECONHECIDO → RESOLVIDO
          </span>
        </div>
        {comp.alerts.length === 0 ? (
          <div className="px-4 py-8 text-center text-[11px] text-gray-400">
            Nenhum alerta no cenário atual. Ative{" "}
            <b className="text-gray-500">IDLE</b>,{" "}
            <b className="text-gray-500">ANOMALY</b>,{" "}
            <b className="text-gray-500">THERMAL</b> ou{" "}
            <b className="text-gray-500">OFFLINE</b>.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {comp.alerts.map((a) => {
              const sev =
                a.severity === "critical"
                  ? { t: "Crítico", c: "#BC0202", b: "#FEF2F2" }
                  : a.severity === "high"
                    ? { t: "Alto", c: "#D97706", b: "#FFFBEB" }
                    : { t: "Médio", c: "#6B7280", b: "#F9FAFB" }

              const st =
                a.status === "resolved"
                  ? { t: "Resolvido", c: "#16A34A" }
                  : a.status === "acknowledged"
                    ? { t: "Reconhecido", c: "#2563EB" }
                    : { t: "Aberto", c: "#BC0202" }

              return (
                <div key={a.id} className="px-4 py-3 flex items-start gap-3">
                  <span
                    className="mt-0.5 w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: sev.c }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] text-gray-400">
                        {a.id}
                      </span>
                      <span className="text-[11px] font-semibold text-[#1F2A37]">
                        {a.machine}{" "}
                        <span className="font-mono text-gray-400">
                          {a.machineId}
                        </span>
                      </span>
                      <span
                        className="text-[9px] font-semibold px-1.5 py-px rounded-full"
                        style={{ color: sev.c, backgroundColor: sev.b }}
                      >
                        {sev.t}
                      </span>
                      <span
                        className="text-[9px] font-semibold"
                        style={{ color: st.c }}
                      >
                        {st.t}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-700 mt-0.5">
                      {a.anomaly}
                    </div>
                    {a.evidence && (
                      <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                        {a.evidence}
                      </div>
                    )}
                    <div className="text-[9px] text-gray-400 mt-1">
                      {a.detectedAt} · {a.anomalyType}
                    </div>
                  </div>
                  {a.status !== "resolved" && (
                    <button
                      onClick={() => advanceAlert(a.id)}
                      disabled={busy}
                      className="shrink-0 px-2.5 py-1 rounded text-[10px] font-semibold text-white disabled:opacity-60"
                      style={{ backgroundColor: "#BC0202" }}
                    >
                      {a.status === "open" ? "Reconhecer" : "Resolver"}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      {/* Antes × Depois + registrar intervenção */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded p-3.5">
          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">
            Antes × Depois (RECOVERY)
          </div>
          {comp.beforeAfter ? (
            <div className="space-y-2">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <div className="text-[9px] text-gray-400 uppercase">
                    Antes
                  </div>
                  <div className="font-mono text-sm font-semibold text-[#1F2A37] tabular-nums">
                    {num(comp.beforeAfter.beforeKwhDay, 1)} kWh/dia
                  </div>
                  <div className="h-2 bg-gray-200 rounded mt-1">
                    <div className="h-full w-full bg-gray-400 rounded" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-[9px] text-gray-400 uppercase">
                    Depois
                  </div>
                  <div className="font-mono text-sm font-semibold text-[#16A34A] tabular-nums">
                    {num(comp.beforeAfter.afterKwhDay, 1)} kWh/dia
                  </div>
                  <div className="h-2 bg-gray-200 rounded mt-1">
                    <div
                      className="h-full bg-[#16A34A] rounded"
                      style={{ width: "70%" }}
                    />
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-gray-100 flex justify-between text-[11px]">
                <span className="text-gray-500">Redução estimada</span>
                <span className="font-mono font-semibold text-[#BC0202] tabular-nums">
                  −{num(comp.beforeAfter.savedKwhDay, 1)} kWh/dia ·{" "}
                  {brl(comp.beforeAfter.savedBrlDay)}/dia
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>Projeção mensal (estimativa)</span>
                <span className="font-mono">
                  {brl(comp.beforeAfter.savedBrlMonth)}/mês
                </span>
              </div>
              <p className="text-[9px] text-gray-400 leading-tight">
                {comp.beforeAfter.note}
              </p>
            </div>
          ) : (
            <div className="text-[11px] text-gray-400 py-4 text-center">
              Ative o cenário <b className="text-gray-500">RECOVERY</b> para ver
              a comparação antes × depois.
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded p-3.5">
          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">
            Registrar intervenção · {selected}
          </div>
          <div className="flex items-end gap-2 flex-wrap">
            <label className="flex flex-col gap-1">
              <span className="text-[9px] text-gray-400 uppercase">
                Antes (kWh/dia)
              </span>
              <input
                value={form.before}
                onChange={(e) => setForm({ ...form, before: e.target.value })}
                placeholder={String((selectedMachine?.baselineKw ?? 8) * 24)}
                className="w-24 px-2 py-1 rounded border border-gray-200 text-[11px] font-mono focus:outline-none focus:border-[#BC0202]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[9px] text-gray-400 uppercase">
                Depois (kWh/dia)
              </span>
              <input
                value={form.after}
                onChange={(e) => setForm({ ...form, after: e.target.value })}
                placeholder={String(
                  ((selectedMachine?.baselineKw ?? 8) * 16.8).toFixed(1),
                )}
                className="w-24 px-2 py-1 rounded border border-gray-200 text-[11px] font-mono focus:outline-none focus:border-[#BC0202]"
              />
            </label>
            <button
              onClick={registerIntervention}
              disabled={busy}
              className="px-3 py-1.5 rounded text-[11px] font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: "#BC0202" }}
            >
              Registrar
            </button>
          </div>
          <div className="text-[9px] text-gray-400 mt-2">
            POST /api/interventions · comparação antes/depois com comprovação de
            economia (estimativa).
          </div>
          {comp.interventions.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {comp.interventions.map((iv) => (
                <div
                  key={iv.id}
                  className="flex items-center justify-between text-[10px] border-t border-gray-50 pt-1.5"
                >
                  <span className="font-mono text-gray-400">{iv.id}</span>
                  <span className="text-gray-600 font-mono">
                    {iv.machineId}
                  </span>
                  <span className="text-gray-400 font-mono">
                    {iv.before} → {iv.after}
                  </span>
                  <span className="font-mono font-semibold text-[#16A34A] tabular-nums">
                    −{num(iv.saved, 1)} kWh
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Analytics determinístico */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white border border-gray-200 rounded p-3.5">
          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">
            Custo estimado por máquina
          </div>
          {(analytics?.cost.perMachine ?? []).map((c) => (
            <div
              key={c.machineId}
              className="flex items-center justify-between text-[11px] py-1 border-b border-gray-50 last:border-0"
            >
              <span className="font-mono text-[#1F2A37]">{c.machineId}</span>
              <span className="text-gray-400 font-mono">
                {num(c.energyKwh, 1)} kWh
              </span>
              <span
                className="font-mono font-semibold tabular-nums"
                style={{ color: "#BC0202" }}
              >
                {brl(c.cost)}
              </span>
            </div>
          ))}
          <div className="text-[9px] text-gray-400 mt-2">
            {analytics?.cost.note ?? "Estimativa (kWh × tarifa)."} · R${" "}
            {num(analytics?.cost.ratePerKwh ?? 0, 2)}/kWh médio
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded p-3.5">
          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">
            Idle / desperdício
          </div>
          <div className="font-mono text-lg font-semibold text-[#D97706] tabular-nums">
            {num(analytics?.idle.totalIdleEnergyKwh ?? 0, 1)} kWh
          </div>
          <div className="text-[10px] text-gray-400 mb-2">
            ≈ {brl(analytics?.idle.totalIdleCost ?? 0)} (estimativa)
          </div>
          {(analytics?.idle.machines ?? []).map((m) => (
            <div
              key={m.machineId}
              className="flex items-center justify-between text-[10px] py-1 border-t border-gray-50"
            >
              <span className="font-mono text-[#1F2A37]">{m.machineId}</span>
              <span className="text-[#D97706]">{m.idleMinutes} min</span>
              <span className="font-mono text-gray-500">
                {num(m.idleEnergyKwh, 1)} kWh
              </span>
            </div>
          ))}
          {(!analytics || analytics.idle.machines.length === 0) && (
            <div className="text-[10px] text-gray-400">
              Nenhuma máquina em IDLE neste cenário.
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded p-3.5">
          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">
            Anomalias detectadas (evidência)
          </div>
          {(analytics?.anomalies ?? []).length === 0 ? (
            <div className="text-[10px] text-gray-400">
              Sem anomalias ativas. O motor analítico usa regras + desvio sobre
              baseline.
            </div>
          ) : (
            (analytics?.anomalies ?? []).map((a, i) => (
              <div
                key={`${a.machineId}-${i}`}
                className="py-1.5 border-b border-gray-50 last:border-0"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#1F2A37]">
                    {a.machineId} · {a.type}
                  </span>
                  <span
                    className="text-[10px] font-mono"
                    style={{
                      color: a.severity === "critical" ? "#BC0202" : "#D97706",
                    }}
                  >
                    {a.deviationPct > 0 ? "+" : ""}
                    {a.deviationPct}%
                  </span>
                </div>
                <div className="text-[10px] text-gray-500 font-mono leading-tight">
                  {a.condition}
                </div>
              </div>
            ))
          )}
          <div className="text-[9px] text-gray-400 mt-2">
            Linguagem de evidência: comportamento anormal que requer inspeção —
            sem afirmação de falha específica.
          </div>
        </div>
      </div>
    </div>
  )
}

export default CompetitionMode
