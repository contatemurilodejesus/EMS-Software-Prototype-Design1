import { useEffect, useState } from "react"
import { useApiResource, useApiAction } from "../lib/api"
import type { AdminData } from "../lib/types"
import { DataSourceBadge } from "./DataSourceBadge"

/** Fallback local — usado quando o backend está indisponível. */
const FALLBACK_ADMIN: AdminData = {
  machines: [
    {
      id: "INJ-01",
      name: "Injetora Engel 480T",
      sector: "A",
      gateway: "GW-SP01",
      pOff: 2,
      pRun: 12,
      nominal: 35,
    },
    {
      id: "INJ-02",
      name: "Injetora Krauss 350T",
      sector: "A",
      gateway: "GW-SP01",
      pOff: 2,
      pRun: 18,
      nominal: 28,
    },
    {
      id: "COMP-01",
      name: "Compressor Atlas 75kW",
      sector: "B",
      gateway: "GW-SP01",
      pOff: 3,
      pRun: 15,
      nominal: 75,
    },
    {
      id: "COMP-02",
      name: "Compressor Schulz 55kW",
      sector: "B",
      gateway: "GW-SP01",
      pOff: 2,
      pRun: 12,
      nominal: 55,
    },
    {
      id: "CNC-02",
      name: "Centro Usinagem DMG 60",
      sector: "D",
      gateway: "GW-SP02",
      pOff: 1,
      pRun: 8,
      nominal: 22,
    },
    {
      id: "CNC-03",
      name: "Fresadora CNC Mazak QT",
      sector: "D",
      gateway: "GW-SP02",
      pOff: 1,
      pRun: 8,
      nominal: 18,
    },
  ],
  tariffs: {
    offPeak: 0.42,
    intermediate: 0.78,
    peak: 2.21,
    contractedDemandKW: 480,
    excessDemandPenalty: 45.8,
  },
  shifts: [
    { id: "A", label: "Turno A", time: "06:00 – 14:00", active: true },
    { id: "B", label: "Turno B", time: "14:00 – 22:00", active: true },
    { id: "C", label: "Turno C", time: "22:00 – 06:00", active: false },
  ],
  gatewayHealth: [
    { k: "Última mensagem MQTT", v: "há 2 min", ok: true },
    { k: "Seq. gap detectado", v: "0", ok: true },
    { k: "Leituras MISSING (24h)", v: "4,1%", ok: true },
    { k: "Leituras OUTLIER (24h)", v: "3,2%", ok: true },
    { k: "Timestamp drift", v: "+1,2 s", ok: true },
    { k: "Versão firmware GW", v: "v1.4.2", ok: true },
  ],
  thresholds: {},
}

const EMPTY_MACHINE = {
  id: "",
  name: "",
  sector: "Setor A",
  gateway: "GW-SP01",
  pOff: "1",
  pRun: "8",
  nominal: "15",
}

export function Admin() {
  // Cadastro, tarifas, turnos e saúde do gateway vêm do backend (/api/admin).
  const { data: admin, refetch, live, loading, error } = useApiResource<AdminData>(
    "/api/admin",
    FALLBACK_ADMIN,
    { pollMs: 20000 },
  )
  const { run, busy, error: actionError } = useApiAction()
  const { machines, tariffs, shifts, gatewayHealth } = admin

  const [showAdd, setShowAdd] = useState(false)
  const [newMachine, setNewMachine] = useState(EMPTY_MACHINE)
  const [tariffForm, setTariffForm] = useState({
    offPeak: String(tariffs.offPeak),
    intermediate: String(tariffs.intermediate),
    peak: String(tariffs.peak),
    contractedDemandKW: String(tariffs.contractedDemandKW),
    excessDemandPenalty: String(tariffs.excessDemandPenalty),
  })

  // Sincroniza o formulário quando o backend responde.
  useEffect(() => {
    setTariffForm({
      offPeak: String(tariffs.offPeak),
      intermediate: String(tariffs.intermediate),
      peak: String(tariffs.peak),
      contractedDemandKW: String(tariffs.contractedDemandKW),
      excessDemandPenalty: String(tariffs.excessDemandPenalty),
    })
  }, [
    tariffs.offPeak,
    tariffs.intermediate,
    tariffs.peak,
    tariffs.contractedDemandKW,
    tariffs.excessDemandPenalty,
  ])

  const saveTariffs = async () => {
    try {
      await run("PATCH", "/api/admin/tariffs", {
        offPeak: Number(tariffForm.offPeak),
        intermediate: Number(tariffForm.intermediate),
        peak: Number(tariffForm.peak),
        contractedDemandKW: Number(tariffForm.contractedDemandKW),
        excessDemandPenalty: Number(tariffForm.excessDemandPenalty),
      })
      refetch()
    } catch {
      /* backend offline */
    }
  }

  const toggleShift = async (id: string) => {
    try {
      await run("POST", `/api/admin/shifts/${id}/toggle`)
      refetch()
    } catch {
      /* backend offline */
    }
  }

  const addMachine = async () => {
    if (!newMachine.id.trim()) return
    try {
      await run("POST", "/api/machines", {
        id: newMachine.id.trim(),
        name: newMachine.name || newMachine.id.trim(),
        sector: newMachine.sector,
        gateway: newMachine.gateway,
        pOff: Number(newMachine.pOff) || 1,
        pRun: Number(newMachine.pRun) || 8,
        nominalKW: Number(newMachine.nominal) || 15,
        power: 0,
      })
      setNewMachine(EMPTY_MACHINE)
      setShowAdd(false)
      refetch()
    } catch {
      /* backend offline */
    }
  }

  const runThresholds = (id: string) => {
    const m = admin.machines.find((x) => x.id === id)
    if (!m) return
    const pRun = window.prompt(`P_run (kW) para ${id}:`, String(m.pRun))
    if (pRun === null) return
    const pOff = window.prompt(`P_off (kW) para ${id}:`, String(m.pOff))
    if (pOff === null) return
    run("PATCH", `/api/machines/${id}`, {
      pRun: Number(pRun) || m.pRun,
      pOff: Number(pOff) || m.pOff,
    })
      .then(() => refetch())
      .catch(() => undefined)
  }

  /* Competition Mode (demo determinístico) — ativação de cenário e reset. */
  const { data: demo, refetch: refetchDemo } = useApiResource<{
    scenario: string
    scenarioLabel: string
    step: number
  }>(
    "/api/demo/status",
    { scenario: "NORMAL", scenarioLabel: "Normal", step: 0 },
    { pollMs: 5000 },
  )
  const setScenario = async (scenario: string) => {
    try {
      await run("POST", "/api/demo/scenario", { scenario })
      refetchDemo()
    } catch {
      /* backend offline */
    }
  }
  const resetDemo = async () => {
    try {
      await run("POST", "/api/demo/reset", {})
      refetchDemo()
    } catch {
      /* backend offline */
    }
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-5 py-5 space-y-5">
      <DataSourceBadge live={live} loading={loading} error={error} label="Administração" />
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-sm font-semibold text-[#1F2A37]">
            Administração — EnergyMatrix
          </h1>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Cadastro de máquinas, tarifas, turnos, limiares e saúde do gateway
          </p>
        </div>
        {actionError && (
          <span className="text-[10px] font-medium text-[#BC0202] bg-red-50 border border-red-200 rounded px-2 py-1">
            {actionError}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Machines config */}
        <div className="lg:col-span-2 bg-white rounded border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold text-[#1F2A37]">
                Cadastro de Máquinas e Limiares
              </h2>
              <p className="text-[9px] text-gray-400 mt-0.5">
                P_off e P_run definem os estados OFF / IDLE / RUNNING
              </p>
            </div>
            <button
              onClick={() => setShowAdd((v) => !v)}
              className="px-3 py-1.5 rounded text-[10px] font-semibold text-white"
              style={{ backgroundColor: "#BC0202" }}
            >
              {showAdd ? "Cancelar" : "+ Máquina"}
            </button>
          </div>

          {showAdd && (
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-end gap-2 flex-wrap">
              {([
                ["id", "ID"],
                ["name", "Nome"],
                ["sector", "Setor"],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex flex-col gap-1">
                  <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">
                    {label}
                  </span>
                  <input
                    value={newMachine[k]}
                    onChange={(e) =>
                      setNewMachine({ ...newMachine, [k]: e.target.value })
                    }
                    className="px-2 py-1 rounded border border-gray-200 text-[11px] w-32 focus:outline-none focus:border-[#BC0202]"
                  />
                </label>
              ))}
              {([
                ["pOff", "P_off (kW)"],
                ["pRun", "P_run (kW)"],
                ["nominal", "Nominal (kW)"],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex flex-col gap-1">
                  <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">
                    {label}
                  </span>
                  <input
                    type="number"
                    value={newMachine[k]}
                    onChange={(e) =>
                      setNewMachine({ ...newMachine, [k]: e.target.value })
                    }
                    className="px-2 py-1 rounded border border-gray-200 text-[11px] w-24 font-mono focus:outline-none focus:border-[#BC0202]"
                  />
                </label>
              ))}
              <button
                onClick={addMachine}
                disabled={busy}
                className="px-3 py-1.5 rounded text-[10px] font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: "#16A34A" }}
              >
                Salvar máquina
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-[9px] text-gray-400 uppercase tracking-wider">
                  <th className="text-left px-4 py-2 font-semibold">ID</th>
                  <th className="text-left px-4 py-2 font-semibold">Nome</th>
                  <th className="text-left px-4 py-2 font-semibold">Setor</th>
                  <th className="text-right px-4 py-2 font-semibold">
                    P_off (kW)
                  </th>
                  <th className="text-right px-4 py-2 font-semibold">
                    P_run (kW)
                  </th>
                  <th className="text-right px-4 py-2 font-semibold">
                    Nominal (kW)
                  </th>
                  <th className="text-left px-4 py-2 font-semibold">Gateway</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {machines.map((m, i) => (
                  <tr
                    key={m.id}
                    className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                      i % 2 === 0 ? "" : "bg-gray-50/40"
                    }`}
                  >
                    <td className="px-4 py-2.5 font-mono text-[10px] text-[#BC0202] font-semibold">
                      {m.id}
                    </td>
                    <td className="px-4 py-2.5 text-[#1F2A37]">{m.name}</td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {m.sector.startsWith("Setor")
                        ? m.sector
                        : `Setor ${m.sector}`}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-600 tabular-nums">
                      {m.pOff}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-600 tabular-nums">
                      {m.pRun}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-600 tabular-nums">
                      {m.nominal}
                    </td>
                    <td className="px-4 py-2.5 text-[10px] text-gray-500 font-mono">
                      {m.gateway}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => runThresholds(m.id)}
                        className="text-[10px] text-[#BC0202] hover:underline font-medium"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tariffs + config */}
        <div className="space-y-4">
          <div className="bg-white rounded border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-[#1F2A37]">
                Competition Mode (demo)
              </h2>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 uppercase tracking-wider">
                Simulado
              </span>
            </div>
            <p className="text-[9px] text-gray-400 mb-2 leading-tight">
              Ativar cenário /resetar o simulador determinístico de 3 máquinas
              (M-001…M-003). Cenário ativo:
              <b className="text-gray-600"> {demo.scenarioLabel}</b> · passo{" "}
              {demo.step} min
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                "NORMAL",
                "IDLE",
                "ANOMALY",
                "THERMAL",
                "OFFLINE",
                "RECOVERY",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setScenario(s)}
                  disabled={busy}
                  className={`px-2 py-1 rounded border text-[9px] font-semibold transition-colors disabled:opacity-60 ${
                    demo.scenario === s
                      ? "text-white"
                      : "text-gray-600 bg-white border-gray-200 hover:bg-gray-50"
                  }`}
                  style={
                    demo.scenario === s
                      ? {
                          backgroundColor: "#BC0202",
                          borderColor: "transparent",
                        }
                      : undefined
                  }
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              onClick={resetDemo}
              disabled={busy}
              className="mt-2 w-full py-1.5 rounded border border-gray-200 text-[10px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
            >
              Reiniciar demo
            </button>
          </div>

          <div className="bg-white rounded border border-gray-200 p-4">
            <h2 className="text-xs font-semibold text-[#1F2A37] mb-3">
              Tarifas ANEEL Ativas
            </h2>
            <div className="space-y-2">
              {([
                ["offPeak", "Fora de ponta (00–17h / 21–24h)"],
                ["intermediate", "Intermediário (17–18h / 21–22h)"],
                ["peak", "Ponta (18–21h)"],
                ["contractedDemandKW", "Demanda contratada (kW)"],
                ["excessDemandPenalty", "Encargo demanda excedente (R$/kW)"],
              ] as const).map(([k, label]) => (
                <div
                  key={k}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-[10px] text-gray-500 leading-tight">
                    {label}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    value={tariffForm[k]}
                    onChange={(e) =>
                      setTariffForm({ ...tariffForm, [k]: e.target.value })
                    }
                    className="w-24 px-2 py-0.5 rounded border border-gray-200 text-[10px] font-mono text-right tabular-nums focus:outline-none focus:border-[#BC0202]"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={saveTariffs}
              disabled={busy}
              className="mt-3 w-full py-1.5 rounded border border-gray-200 text-[10px] font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              {busy ? "Salvando…" : "Atualizar tarifas"}
            </button>
          </div>

          <div className="bg-white rounded border border-gray-200 p-4">
            <h2 className="text-xs font-semibold text-[#1F2A37] mb-3">
              Turnos de Produção
            </h2>
            <div className="space-y-2">
              {shifts.map(({ id, label, time, active }) => (
                <div key={id} className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-[#1F2A37]">
                      {label}
                    </div>
                    <div className="text-[9px] text-gray-400 font-mono">
                      {time}
                    </div>
                  </div>
                  <button
                    onClick={() => toggleShift(id)}
                    aria-label={`Alternar ${label}`}
                    className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${
                      active ? "bg-[#16A34A]" : "bg-gray-200"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${
                        active ? "left-4" : "left-0.5"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded border border-gray-200 p-4">
            <h2 className="text-xs font-semibold text-[#1F2A37] mb-3">
              Saúde do Gateway
            </h2>
            <div className="space-y-2">
              {gatewayHealth.map(({ k, v, ok }) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500">{k}</span>
                  <span
                    className={`font-mono text-[10px] font-medium tabular-nums ${
                      ok ? "text-[#16A34A]" : "text-[#BC0202]"
                    }`}
                  >
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
