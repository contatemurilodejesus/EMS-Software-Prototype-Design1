/**
 * EnergyMatrix EMS - SIMULADOR determinístico (Competition Mode).
 *
 * REGRAS DO PROTOTIPO (preservadas):
 *  - nenhum valor exibido usa Math.random(): a telemetria e funcao pura de
 *    (perfil, cenario, passo) -> mesma execucao, mesmos numeros;
 *  - tempo virtual: 1 passo = 1 minuto simulado (nenhuma leitura de relogio);
 *  - 3 maquinas (M-001, M-002, M-003) e 6 cenarios;
 *  - dados rotulados como simulados (`simulated: true` / `estimated: true`).
 *
 * Esta camada NAO conhece banco de dados, HTTP nem Express: apenas gera o
 * contrato de telemetria (secao 9) e o estado do cenario.
 */

import {
  classifyState,
  nominalCurrent,
  NOMINAL_VOLTAGE,
  DEFAULT_THRESHOLDS,
} from "../analytics/index.ts"
import { blendedRate, DEFAULT_TARIFF } from "../analytics/cost.ts"
import { computeIdleCostDay } from "../analytics/idle.ts"
import { energyFromPower } from "../analytics/energy.ts"
import {
  anomalyFromBaseline,
  deviationPctFromBaseline,
  detectAnomalies,
} from "../analytics/anomaly.ts"
import { IDLE_ALERT_MINUTES } from "../analytics/idle.ts"
import { offlineAnomaly } from "../analytics/offline.ts"
import { thermalRamp } from "../analytics/thermal.ts"
import type { Alert, Tariff, Thresholds, Anomaly } from "../domain/entities/index.ts"
import type { DataQuality, MachineState, ScenarioId } from "../domain/value-objects/index.ts"

export const COMPETITION_SCENARIOS: readonly ScenarioId[] = [
  "NORMAL",
  "IDLE",
  "ANOMALY",
  "THERMAL",
  "OFFLINE",
  "RECOVERY",
  "CASCADE_IDLE",
]

export interface ScenarioMeta {
  label: string
  target: string | null
  note: string
}

export const SCENARIO_META: Readonly<Record<ScenarioId, ScenarioMeta>> = {
  NORMAL: { label: "Normal", target: null, note: "Operação estável — referência" },
  IDLE: { label: "IDLE prolongado", target: "M-001", note: "Consumo sem produção identificada" },
  ANOMALY: { label: "Anomalia de potência", target: "M-002", note: "Potência acima do baseline" },
  THERMAL: { label: "Térmico", target: "M-002", note: "Temperatura acima do normal" },
  OFFLINE: { label: "Offline", target: "M-003", note: "Ausência de telemetria" },
  RECOVERY: { label: "Recuperação", target: "M-001", note: "Redução após intervenção" },
  CASCADE_IDLE: {
    label: "Cascata IDLE",
    target: "M-001",
    note: "M-001 STOPPED; M-002 e M-003 seguem em IDLE (possível desperdício)",
  },
}

/** Perfis determinísticos das 3 maquinas (secao 14 do documento). */
export interface CompetitionProfile {
  id: string
  name: string
  type: string
  sector: string
  gateway: string
  pOff: number
  pIdle: number
  pRun: number
  baselineKw: number
  baseTempC: number
  nominalKW: number
  pfRun: number
}

export const COMPETITION_MACHINES: readonly CompetitionProfile[] = [
  {
    id: "M-001",
    name: "Compressor 01",
    type: "Compressor",
    sector: "Setor A",
    gateway: "GW-DEMO",
    pOff: 0.2,
    pIdle: 2.0,
    pRun: 8.0,
    baselineKw: 8.0,
    baseTempC: 43,
    nominalKW: 15,
    pfRun: 0.94,
  },
  {
    id: "M-002",
    name: "Injetora 02",
    type: "Injetora",
    sector: "Setor B",
    gateway: "GW-DEMO",
    pOff: 0.3,
    pIdle: 3.0,
    pRun: 12.0,
    baselineKw: 10.0,
    baseTempC: 48,
    nominalKW: 22,
    pfRun: 0.92,
  },
  {
    id: "M-003",
    name: "Prensa 03",
    type: "Prensa",
    sector: "Setor C",
    gateway: "GW-DEMO",
    pOff: 0.2,
    pIdle: 1.5,
    pRun: 6.0,
    baselineKw: 6.0,
    baseTempC: 41,
    nominalKW: 11,
    pfRun: 0.95,
  },
]

/** Ruido determinístico em [-1, 1] - substituto de Math.random() (shared). */
import { dnoise, hashId } from "../shared/utils/deterministic.ts"
export { dnoise, hashId }

const r1 = (value: number): number => Number((Number(value) || 0).toFixed(1))

export interface DeterministicTelemetry {
  machineId: string
  step: number
  powerKw: number
  voltageV: number
  currentA: number
  powerFactor: number
  temperatureC: number
  state: MachineState
  quality: DataQuality
  online: boolean
}

/** Limiares do motor analitico deterministico. */
export const COMPETITION_THRESHOLDS: Thresholds = {
  ...DEFAULT_THRESHOLDS,
  baselineTolerancePct: 30,
}

/**
 * Telemetria determinística de uma maquina em um passo do cenario.
 * passo 0 = estado inicial do cenario; passo N = N minutos simulados.
 */
export function machineTelemetry(
  profile: CompetitionProfile,
  scenario: ScenarioId,
  step: number,
): DeterministicTelemetry {
  const seed = hashId(profile.id)
  const isTarget = SCENARIO_META[scenario].target === profile.id

  // Banda NORMAL sempre acima de P_run (evita IDLE espurio) - determinística.
  let powerR = profile.pRun + 0.3 + (dnoise(step, seed) * 0.5 + 0.5) * 0.6
  let tempR = profile.baseTempC + dnoise(step, seed + 7) * 1.2
  const pf = profile.pfRun + dnoise(step, seed + 11) * 0.01
  let online = true
  let quality: DataQuality = "GOOD"

  if (isTarget) {
    if (scenario === "IDLE") {
      powerR = profile.pIdle + dnoise(step, seed + 3) * 0.1
      tempR = profile.baseTempC - 4
    } else if (scenario === "ANOMALY") {
      // +50% sobre o baseline (exemplo do documento: 8 kW -> 12 kW = +50%)
      powerR = profile.baselineKw * 1.5 + dnoise(step, seed + 5) * 0.3
    } else if (scenario === "THERMAL") {
      tempR = thermalRamp(profile.baseTempC, step)
    } else if (scenario === "OFFLINE") {
      if (step >= 3) {
        online = false
        quality = "MISSING"
      }
    } else if (scenario === "RECOVERY") {
      // ANTES: operacao ineficiente na baseline -> DEPOIS: -30% apos a intervencao
      if (step < 10) {
        powerR = profile.baselineKw + dnoise(step, seed + 9) * 0.3
        tempR = profile.baseTempC + 3
      } else {
        powerR = profile.baselineKw * 0.7 + dnoise(step, seed + 13) * 0.3
        tempR = profile.baseTempC
      }
    }
  }

  const state = classifyState(powerR, profile.pOff, profile.pRun)
  const voltage = online ? Math.round(NOMINAL_VOLTAGE + dnoise(step, seed + 17) * 2) : 0
  const iNom = nominalCurrent(profile.nominalKW, voltage || NOMINAL_VOLTAGE)
  const current =
    online && powerR > 0 ? r1(iNom * (powerR / Math.max(0.1, profile.nominalKW))) : 0

  return {
    machineId: profile.id,
    step,
    powerKw: r1(powerR),
    voltageV: voltage,
    currentA: current,
    powerFactor: online ? Number(pf.toFixed(2)) : 0,
    temperatureC: Math.round(tempR),
    state,
    quality,
    online,
  }
}

/** Estado interno de uma maquina do demo (acumuladores do cenario). */
interface SimMachine extends CompetitionProfile {
  energyKwh: number
  energyStart: number
  idleEnergyKwh: number
  idleMinutes: number
  powerKw: number
  voltageV: number
  currentA: number
  powerFactor: number
  temperatureC: number
  state: MachineState
  quality: DataQuality
  online: boolean
  anomalies: Anomaly[]
  deviationPct: number
  isAnomaly: boolean
  idleCostDay: number
}

export interface CompetitionMachineView {
  id: string
  name: string
  type: string
  sector: string
  gateway: string
  pOff: number
  pIdle: number
  pRun: number
  baselineKw: number
  nominalKW: number
  state: MachineState
  quality: DataQuality
  online: boolean
  power: number
  voltage: number
  current: number
  powerFactor: number
  temperature: number
  consumption: number
  idleMinutes?: number
  idleCostDay?: number
  deviationPct: number
  anomalyDesc?: string
  lastUpdate: string
}

export interface CompetitionIntervention {
  id: string
  machineId: string
  description: string
  before: number
  after: number
  saved: number
  simulated: true
  createdAt: string
}

/**
 * Fabrica do estado do Competition Mode (maquina de estados determinística).
 * Toda geracao de telemetria vem de `machineTelemetry` (funcao pura).
 */
export function createCompetitionSimulator(options: { tariff?: Tariff } = {}) {
  const tariff = options.tariff ?? DEFAULT_TARIFF

  const state = {
    scenario: "NORMAL" as ScenarioId,
    step: 0,
    simulated: true as const,
    deterministic: true as const,
    machines: [] as SimMachine[],
    alerts: [] as Alert[],
    interventions: [] as CompetitionIntervention[],
    alertSeq: 0,
  }

  function seedMachine(profile: CompetitionProfile): SimMachine {
    const e0 = 1000 + hashId(profile.id) * 7 // energia inicial determinística (kWh)
    return {
      ...profile,
      energyKwh: e0,
      energyStart: e0,
      idleEnergyKwh: 0,
      idleMinutes: 0,
      powerKw: profile.pRun,
      voltageV: NOMINAL_VOLTAGE,
      currentA: 0,
      powerFactor: profile.pfRun,
      temperatureC: profile.baseTempC,
      state: "RUNNING",
      quality: "GOOD",
      online: true,
      anomalies: [],
      deviationPct: 0,
      isAnomaly: false,
      idleCostDay: computeIdleCostDay(profile.pRun, tariff),
    }
  }

  function reset(scenario: ScenarioId | string = "NORMAL") {
    state.scenario = COMPETITION_SCENARIOS.includes(scenario as ScenarioId)
      ? (scenario as ScenarioId)
      : "NORMAL"
    state.step = 0
    state.alerts = []
    state.interventions = []
    state.alertSeq = 0
    state.machines = COMPETITION_MACHINES.map(seedMachine)
    return status()
  }

  /** Anomalias determinísticas = regras EMS + desvio sobre baseline + IDLE. */
  function anomaliesFor(m: SimMachine): Anomaly[] {
    const out = detectAnomalies(
      {
        power: m.powerKw,
        pOff: m.pOff,
        pRun: m.pRun,
        temperature: m.temperatureC,
        powerFactor: m.powerFactor,
        voltage: m.voltageV,
        current: m.currentA,
        nominalKW: m.nominalKW,
      },
      COMPETITION_THRESHOLDS,
    )

    const tolerance = COMPETITION_THRESHOLDS.baselineTolerancePct ?? 30
    const dev = deviationPctFromBaseline(m.powerKw, m.baselineKw)
    if (m.online && m.state !== "IDLE" && dev > tolerance) {
      const anomaly = anomalyFromBaseline(m.powerKw, m.baselineKw, tolerance)
      if (anomaly) out.push(anomaly)
    }

    if (m.online && m.state === "IDLE" && m.idleMinutes >= IDLE_ALERT_MINUTES) {
      out.push({
        type: "Consumo Improdutivo",
        severity: "high",
        desc: `IDLE prolongado (${m.idleMinutes} min)`,
        condition: `Estado IDLE por ≥ ${IDLE_ALERT_MINUTES} min (P = ${m.powerKw} kW entre P_off ${m.pOff} kW e P_run ${m.pRun} kW, sem produção registrada)`,
      })
    }

    return out
  }

  /** Um alerta por (cenario, maquina) enquanto houver anomalia ativa. */
  function ensureAlert(m: SimMachine, anomalies: Anomaly[]) {
    if (!anomalies.length) return
    const primary = anomalies.find((a) => a.severity === "critical") ?? anomalies[0]
    const key = `${state.scenario}:${m.id}`
    if (state.alerts.some((a) => a.key === key && a.status !== "resolved")) return

    state.alertSeq += 1
    state.alerts.unshift({
      key,
      id: `ALT-DEMO-${String(state.alertSeq).padStart(4, "0")}`,
      machine: m.name,
      machineId: m.id,
      sector: m.sector,
      anomaly: primary.desc,
      anomalyType: primary.type,
      condition: primary.condition,
      severity: primary.severity,
      status: "open",
      message: `Comportamento anormal que requer inspeção (${primary.type}).`,
      evidence: primary.condition,
      auto: true,
      detectedAt: `cenário ${state.scenario} · passo ${state.step}`,
    })
  }

  /** Avanca um passo determinístico (1 minuto simulado). */
  function step() {
    state.step += 1
    for (const m of state.machines) {
      const t = machineTelemetry(m, state.scenario, state.step)
      m.powerKw = t.powerKw
      m.voltageV = t.voltageV
      m.currentA = t.currentA
      m.powerFactor = t.powerFactor
      m.temperatureC = t.temperatureC
      m.state = t.state
      m.quality = t.quality
      m.online = t.online

      if (m.online) {
        const kwh = energyFromPower(m.powerKw)
        m.energyKwh = Number((m.energyKwh + kwh).toFixed(3))
        if (m.state === "IDLE") {
          m.idleEnergyKwh = Number((m.idleEnergyKwh + kwh).toFixed(3))
          m.idleMinutes += 1
        }
      }

      const anomalies = m.online ? anomaliesFor(m) : [offlineAnomaly(state.step)]
      m.anomalies = anomalies
      m.deviationPct = Number(deviationPctFromBaseline(m.powerKw, m.baselineKw).toFixed(0))
      m.isAnomaly = anomalies.some((a) => a.severity === "critical")
      if (m.isAnomaly) m.state = "ANOMALY"
      m.idleCostDay = computeIdleCostDay(m.powerKw, tariff)
      ensureAlert(m, anomalies)
    }
    return status()
  }

function machines(): CompetitionMachineView[] {
    return state.machines.map((m) => ({
      id: m.id,
      name: m.name,
      type: m.type,
      sector: m.sector,
      gateway: m.gateway,
      pOff: m.pOff,
      pIdle: m.pIdle,
      pRun: m.pRun,
      baselineKw: m.baselineKw,
      nominalKW: m.nominalKW,
      state: m.state,
      quality: m.quality,
      online: m.online,
      power: m.powerKw,
      voltage: m.voltageV,
      current: m.currentA,
      powerFactor: m.powerFactor,
      temperature: m.temperatureC,
      consumption: Number(m.energyKwh.toFixed(1)),
      idleMinutes: m.state === "IDLE" ? m.idleMinutes : undefined,
      idleCostDay: m.idleCostDay,
      deviationPct: m.deviationPct,
      anomalyDesc: m.anomalies?.length ? m.anomalies.map((a) => a.desc).join(" · ") : undefined,
      lastUpdate: `passo ${state.step}`,
    }))
  }

  /** Serie determinística da maquina: reconstruida do passo 0 ate o atual. */
  function telemetry(id: string) {
    const machine = state.machines.find((x) => x.id === id)
    if (!machine) return null
    return Array.from({ length: state.step + 1 }, (_, k) => {
      const t = machineTelemetry(machine, state.scenario, k)
      return {
        ts: `T+${k}min`,
        powerKw: t.powerKw,
        temperatureC: t.temperatureC,
        voltageV: t.voltageV,
        state: t.state,
        quality: t.quality,
      }
    })
  }

  function analyticsFor(m: SimMachine) {
    const rate = blendedRate(tariff)
    return {
      machineId: m.id,
      state: m.state,
      quality: m.quality,
      powerKw: m.powerKw,
      baselineKw: m.baselineKw,
      deviationPct: Number(deviationPctFromBaseline(m.powerKw, m.baselineKw).toFixed(1)),
      idleMinutes: m.idleMinutes,
      idleEnergyKwh: Number(m.idleEnergyKwh.toFixed(2)),
      idleCostDay: Math.round(
        m.idleEnergyKwh > 0 ? m.idleEnergyKwh * 24 * rate : m.idleCostDay || 0,
      ),
      energyKwh: Number(m.energyKwh.toFixed(2)),
      estimated: true,
    }
  }

  function analytics() {
    const rate = blendedRate(tariff)
    const list = state.machines.map(analyticsFor)
    const idleEnergy = state.machines.reduce((s, m) => s + m.idleEnergyKwh, 0)
    const anomalies = state.machines.flatMap((m) =>
      (m.anomalies ?? []).map((a) => ({
        machineId: m.id,
        machine: m.name,
        ...a,
        deviationPct: m.deviationPct,
      })),
    )

    return {
      simulated: true,
      scenario: state.scenario,
      step: state.step,
      idle: {
        machines: list.filter((m) => m.idleMinutes > 0),
        totalIdleEnergyKwh: Number(idleEnergy.toFixed(2)),
        totalIdleCost: Math.round(idleEnergy * rate),
        estimated: true,
      },
      anomalies,
      cost: {
        ratePerKwh: Number(rate.toFixed(4)),
        perMachine: list.map((m) => ({
          machineId: m.machineId,
          energyKwh: m.energyKwh,
          cost: Math.round(m.energyKwh * rate),
        })),
        estimated: true,
        note: "Custo estimado no cenário simulado (kWh × tarifa).",
      },
    }
  }

function kpis() {
    const rate = blendedRate(tariff)
    const totalEnergy = state.machines.reduce((s, m) => s + (m.energyKwh - m.energyStart), 0)
    const idleEnergy = state.machines.reduce((s, m) => s + m.idleEnergyKwh, 0)
    const openAlerts = state.alerts.filter((a) => a.status !== "resolved")
    const worst = state.machines.reduce(
      (acc, m) => (Math.abs(m.deviationPct ?? 0) > Math.abs(acc.deviationPct ?? 0) ? m : acc),
      state.machines[0] ?? ({ deviationPct: 0 } as SimMachine),
    )
    const saved = state.interventions.reduce((s, i) => s + i.saved, 0)

    return {
      energyKwh: Math.round(totalEnergy),
      costBrl: Math.round(totalEnergy * rate),
      wasteKwh: Number(idleEnergy.toFixed(1)),
      wasteBrl: Math.round(idleEnergy * rate),
      alerts: openAlerts.length,
      machines: state.machines.length,
      idleMachines: state.machines.filter((m) => m.state === "IDLE").length,
      anomalyMachines: state.machines.filter((m) => m.state === "ANOMALY").length,
      offlineMachines: state.machines.filter((m) => !m.online).length,
      criticalMachine: worst?.id ?? null,
      criticalMachineName: worst?.name ?? null,
      savingsBrl: Math.round(saved),
      estimated: true,
    }
  }

  /** ANTES x DEPOIS do cenario RECOVERY (-30% apos a intervencao). */
  function beforeAfter() {
    const targetId = SCENARIO_META[state.scenario].target
    if (state.scenario !== "RECOVERY" || !targetId) return null
    const machine = state.machines.find((x) => x.id === targetId)
    if (!machine) return null

    const before = Number((machine.baselineKw * 24).toFixed(1))
    const after = Number((machine.baselineKw * 0.7 * 24).toFixed(1))
    const rate = blendedRate(tariff)

    return {
      machineId: machine.id,
      machine: machine.name,
      beforeKwhDay: before,
      afterKwhDay: after,
      beforeBrlDay: Math.round(before * rate),
      afterBrlDay: Math.round(after * rate),
      savedKwhDay: Number((before - after).toFixed(1)),
      savedBrlDay: Math.round((before - after) * rate),
      savedBrlMonth: Math.round((before - after) * rate * 30),
      estimated: true,
      note: "Estimativa do cenário simulado — não representa economia real de fábrica.",
    }
  }

  function dashboard() {
    return {
      simulated: true,
      deterministic: true,
      scenario: state.scenario,
      scenarioLabel: SCENARIO_META[state.scenario].label,
      targetMachine: SCENARIO_META[state.scenario].target,
      step: state.step,
      kpis: kpis(),
      machines: machines(),
      alerts: state.alerts,
      interventions: state.interventions,
      beforeAfter: beforeAfter(),
      tariff: { ...tariff },
    }
  }

  function status() {
    return {
      simulated: true,
      deterministic: true,
      scenario: state.scenario,
      scenarioLabel: SCENARIO_META[state.scenario].label,
      targetMachine: SCENARIO_META[state.scenario].target,
      note: SCENARIO_META[state.scenario].note,
      step: state.step,
      scenarios: COMPETITION_SCENARIOS.map((id) => ({ id, ...SCENARIO_META[id] })),
      kpis: kpis(),
      alerts: state.alerts,
      interventions: state.interventions,
      beforeAfter: beforeAfter(),
    }
  }

  function addIntervention(
    input: { machineId?: string; before?: number; after?: number; description?: string } = {},
  ): CompetitionIntervention {
    const before = Number(input.before) || 0
    const after = Number(input.after) || 0
    const seq = state.interventions.length + 1

    const intervention: CompetitionIntervention = {
      id: `INT-DEMO-${String(seq).padStart(3, "0")}`,
      machineId: input.machineId ?? SCENARIO_META[state.scenario].target ?? "M-001",
      description: input.description ?? "Intervenção simulada registrada",
      before,
      after,
      saved: Number(Math.max(0, before - after).toFixed(1)),
      simulated: true,
      createdAt: `passo ${state.step} · cenário ${state.scenario}`,
    }

    state.interventions.unshift(intervention)
    return intervention
  }

  function advanceAlert(id: string): Alert | null {
    const alert = state.alerts.find((x) => x.id === id)
    if (!alert) return null
    const lifecycle = ["open", "acknowledged", "resolved"] as const
    const next = lifecycle[lifecycle.indexOf(alert.status) + 1]
    if (next) alert.status = next
    return { ...alert }
  }

  reset("NORMAL")

  return {
    state,
    reset,
    step,
    status,
    dashboard,
    machines,
    machine: (id: string) => machines().find((m) => m.id === id) ?? null,
    telemetry,
    analytics,
    alerts: () => state.alerts,
    addIntervention,
    advanceAlert,
    beforeAfter,
    kpis,
  }
}

export type CompetitionSimulator = ReturnType<typeof createCompetitionSimulator>