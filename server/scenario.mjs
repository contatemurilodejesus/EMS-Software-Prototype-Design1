/**
 * EnergyMatrix EMS — Competition Mode (simulador determinístico).
 *
 * Implementa o "Competition Mode" descrito no Documento Técnico (seção 8) e no
 * Plano Técnico (seções 4 e 5): três máquinas virtuais (M-001, M-002, M-003) e
 * seis cenários — NORMAL, IDLE, ANOMALY, THERMAL, OFFLINE e RECOVERY.
 *
 * REGRAS DO PROJETO:
 *   - nenhum valor exibido usa Math.random(); a telemetria é função pura do
 *     passo (step), do cenário e da máquina → mesma execução, mesmos números;
 *   - o cenário é reiniciável (`reset`) e o estado é sempre reconstruído;
 *   - dados claramente marcados como SIMULADOS (`simulated: true`).
 *
 * Funções puras + fábrica de estado — reutilizado por server/store.mjs.
 */

import * as ems from "./ems.mjs"

export const COMPETITION_SCENARIOS = [
  "NORMAL",
  "IDLE",
  "ANOMALY",
  "THERMAL",
  "OFFLINE",
  "RECOVERY",
]

export const SCENARIO_META = {
  NORMAL: {
    label: "Normal",
    target: null,
    note: "Operação estável — referência",
  },

  IDLE: {
    label: "IDLE prolongado",
    target: "M-001",
    note: "Consumo sem produção identificada",
  },

  ANOMALY: {
    label: "Anomalia de potência",
    target: "M-002",
    note: "Potência acima do baseline",
  },

  THERMAL: {
    label: "Térmico",
    target: "M-002",
    note: "Temperatura acima do normal",
  },

  OFFLINE: {
    label: "Offline",
    target: "M-003",
    note: "Ausência de telemetria",
  },

  RECOVERY: {
    label: "Recuperação",
    target: "M-001",
    note: "Redução após intervenção",
  },
}

/** Perfis determinísticos das 3 máquinas (Documento Técnico, seção 11). */

export const COMPETITION_MACHINES = [
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

/** Ruído determinístico em [-1, 1] — substitui Math.random() na demonstração. */

export function dnoise(step, seed) {
  const x = Math.sin((step + 1) * 12.9898 + seed * 78.233) * 43758.5453

  return (x - Math.floor(x)) * 2 - 1
}

/** Semente estável derivada do id da máquina. */

function hashId(id) {
  let h = 0

  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 997

  return h
}

const r1 = (v) => Number((Number(v) || 0).toFixed(1))

/**
 * Telemetria determinística de uma máquina em um passo do cenário.
 * step 0 = estado inicial do cenário; step N = N minutos simulados.
 */

export function machineTelemetry(profile, scenario, step) {
  const seed = hashId(profile.id)

  const target = SCENARIO_META[scenario]?.target === profile.id

  // Banda NORMAL sempre acima de P_run (evita IDLE espúrio) — determinística.

  let powerR = profile.pRun + 0.3 + (dnoise(step, seed) * 0.5 + 0.5) * 0.6

  let tempR = profile.baseTempC + dnoise(step, seed + 7) * 1.2

  let pf = profile.pfRun + dnoise(step, seed + 11) * 0.01

  let online = true

  let quality = "GOOD"

  if (target) {
    if (scenario === "IDLE") {
      powerR = profile.pIdle + dnoise(step, seed + 3) * 0.1

      tempR = profile.baseTempC - 4
    } else if (scenario === "ANOMALY") {
      // +50% sobre o baseline (exemplo do documento: 8 kW → 12 kW = +50%)

      powerR = profile.baselineKw * 1.5 + dnoise(step, seed + 5) * 0.3
    } else if (scenario === "THERMAL") {
      tempR = profile.baseTempC + Math.min(45, step * 2.5)
    } else if (scenario === "OFFLINE") {
      if (step >= 3) {
        online = false
        quality = "MISSING"
      }
    } else if (scenario === "RECOVERY") {
      // ANTES: operação ineficiente no baseline → DEPOIS: −30% após a intervenção

      if (step < 10) {
        powerR = profile.baselineKw + dnoise(step, seed + 9) * 0.3
        tempR = profile.baseTempC + 3
      } else {
        powerR = profile.baselineKw * 0.7 + dnoise(step, seed + 13) * 0.3
        tempR = profile.baseTempC
      }
    }
  }

  const state = ems.classifyState(powerR, profile.pOff, profile.pRun)

  const voltage = online
    ? Math.round(ems.NOMINAL_VOLTAGE + dnoise(step, seed + 17) * 2)
    : 0

  const iNom = ems.nominalCurrent(
    profile.nominalKW,
    voltage || ems.NOMINAL_VOLTAGE,
  )

  const current =
    online && powerR > 0
      ? r1(iNom * (powerR / Math.max(0.1, profile.nominalKW)))
      : 0

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

/** Limiares do motor analítico determinístico (seção 7 do Documento Técnico). */

export const COMPETITION_THRESHOLDS = {
  temperatureCriticalC: 85,

  temperatureWarnC: 80,

  powerFactorMin: 0.85,

  voltageTolerancePct: 5,

  overcurrentFactor: 1.3,

  baselineTolerancePct: 30,
}

/** Minutos em IDLE antes de gerar alerta de consumo improdutivo. */

export const IDLE_ALERT_MINUTES = 5

/**
 * Fábrica do estado do Competition Mode.
 * @param {{ tariff?: object }} options
 */

export function createCompetition(options = {}) {
  const tariff = options.tariff

  const state = {
    scenario: "NORMAL",

    step: 0,

    simulated: true,

    deterministic: true,

    machines: [],

    alerts: [],

    interventions: [],

    alertSeq: 0,
  }

  function seedMachine(profile) {
    const e0 = 1000 + hashId(profile.id) * 7 // energia inicial determinística (kWh)

    return {
      ...profile,

      energyKwh: e0,

      energyStart: e0,

      idleEnergyKwh: 0,

      idleMinutes: 0,

      powerKw: profile.pRun,

      voltageV: ems.NOMINAL_VOLTAGE,

      currentA: 0,

      powerFactor: profile.pfRun,

      temperatureC: profile.baseTempC,

      state: "RUNNING",

      quality: "GOOD",

      online: true,
    }
  }

  function reset(scenario = "NORMAL") {
    state.scenario = COMPETITION_SCENARIOS.includes(scenario)
      ? scenario
      : "NORMAL"

    state.step = 0

    state.alerts = []

    state.interventions = []

    state.alertSeq = 0

    state.machines = COMPETITION_MACHINES.map(seedMachine)

    return status()
  }

  /** Anomalias determinísticas = regras EMS + desvio sobre baseline + IDLE. */

  function anomaliesFor(m) {
    const out = ems.detectAnomalies(
      {
        power: m.powerKw,

        pOff: m.pOff,

        temperature: m.temperatureC,

        powerFactor: m.powerFactor,

        voltage: m.voltageV,

        current: m.currentA,

        nominalKW: m.nominalKW,
      },
      COMPETITION_THRESHOLDS,
    )

    const dev =
      m.baselineKw > 0 ? ((m.powerKw - m.baselineKw) / m.baselineKw) * 100 : 0

    if (
      m.online &&
      m.state !== "IDLE" &&
      dev > COMPETITION_THRESHOLDS.baselineTolerancePct
    ) {
      out.push({
        type: "Anomalia de Consumo",

        severity: "critical",

        desc: `Consumo acima da baseline (+${dev.toFixed(0)}%)`,

        condition: `P = ${m.powerKw} kW vs baseline ${m.baselineKw} kW → desvio +${dev.toFixed(0)}%`,
      })
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

  function ensureAlert(m, anomalies) {
    if (!anomalies.length) return

    const primary =
      anomalies.find((a) => a.severity === "critical") ?? anomalies[0]

    const key = `${state.scenario}:${m.id}`

    if (state.alerts.some((a) => a.key === key && a.status !== "resolved"))
      return

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

      simulated: true,

      detectedAt: `cenário ${state.scenario} · passo ${state.step}`,
    })
  }

  /** Avança um passo determinístico (1 minuto simulado). */

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
        const kwh = m.powerKw / 60

        m.energyKwh = Number((m.energyKwh + kwh).toFixed(3))

        if (m.state === "IDLE") {
          m.idleEnergyKwh = Number((m.idleEnergyKwh + kwh).toFixed(3))
          m.idleMinutes += 1
        }
      }

      const anomalies = m.online
        ? anomaliesFor(m)
        : [
            {
              type: "Offline",
              severity: "high",
              desc: "Ausência de telemetria (MISSING)",
              condition: `Sem mensagens desde o passo ${state.step - 2}`,
            },
          ]

      m.anomalies = anomalies

      m.deviationPct =
        m.baselineKw > 0
          ? Number(
              (((m.powerKw - m.baselineKw) / m.baselineKw) * 100).toFixed(0),
            )
          : 0

      m.isAnomaly = anomalies.some((a) => a.severity === "critical")

      if (m.isAnomaly) m.state = "ANOMALY"

      m.idleCostDay = ems.computeIdleCostDay(m.powerKw, tariff)

      ensureAlert(m, anomalies)
    }

    return status()
  }

  function machines() {
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

      anomalyDesc: m.anomalies?.length
        ? m.anomalies.map((a) => a.desc).join(" · ")
        : undefined,

      lastUpdate: `passo ${state.step}`,
    }))
  }

  function telemetry(id) {
    const m = state.machines.find((x) => x.id === id)

    if (!m) return null

    return Array.from({ length: state.step + 1 }, (_, k) => {
      const t = machineTelemetry(m, state.scenario, k)

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

  function analyticsFor(m) {
    const rate = ems.blendedRate(tariff)

    const dev =
      m.baselineKw > 0 ? ((m.powerKw - m.baselineKw) / m.baselineKw) * 100 : 0

    return {
      machineId: m.id,
      state: m.state,
      quality: m.quality,

      powerKw: m.powerKw,
      baselineKw: m.baselineKw,
      deviationPct: Number(dev.toFixed(1)),

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
    const ms = state.machines.map(analyticsFor)

    const rate = ems.blendedRate(tariff)

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
        machines: ms.filter((m) => m.idleMinutes > 0),

        totalIdleEnergyKwh: Number(idleEnergy.toFixed(2)),

        totalIdleCost: Math.round(idleEnergy * rate),

        estimated: true,
      },

      anomalies,

      cost: {
        ratePerKwh: Number(rate.toFixed(4)),

        perMachine: ms.map((m) => ({
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
    const rate = ems.blendedRate(tariff)

    const totalEnergy = state.machines.reduce(
      (s, m) => s + (m.energyKwh - m.energyStart),
      0,
    )

    const idleEnergy = state.machines.reduce((s, m) => s + m.idleEnergyKwh, 0)

    const openAlerts = state.alerts.filter((a) => a.status !== "resolved")

    const worst = state.machines.reduce(
      (acc, m) =>
        Math.abs(m.deviationPct ?? 0) > Math.abs(acc.deviationPct ?? 0)
          ? m
          : acc,

      state.machines[0] ?? { deviationPct: 0 },
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

      anomalyMachines: state.machines.filter((m) => m.state === "ANOMALY")
        .length,

      offlineMachines: state.machines.filter((m) => !m.online).length,

      criticalMachine: worst?.id ?? null,

      criticalMachineName: worst?.name ?? null,

      savingsBrl: Math.round(saved),

      estimated: true,
    }
  }

  function beforeAfter() {
    const targetId = SCENARIO_META[state.scenario].target

    if (state.scenario !== "RECOVERY" || !targetId) return null

    const m = state.machines.find((x) => x.id === targetId)

    if (!m) return null

    const before = Number((m.baselineKw * 24).toFixed(1))

    const after = Number((m.baselineKw * 0.7 * 24).toFixed(1))

    const rate = ems.blendedRate(tariff)

    return {
      machineId: m.id,
      machine: m.name,

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

  function addIntervention(input = {}) {
    const before = Number(input.before) || 0

    const after = Number(input.after) || 0

    const seq = state.interventions.length + 1

    const iv = {
      id: `INT-DEMO-${String(seq).padStart(3, "0")}`,

      machineId:
        input.machineId ?? SCENARIO_META[state.scenario].target ?? "M-001",

      description: input.description ?? "Intervenção simulada registrada",

      before,
      after,
      saved: Number(Math.max(0, before - after).toFixed(1)),

      simulated: true,

      createdAt: `passo ${state.step} · cenário ${state.scenario}`,
    }

    state.interventions.unshift(iv)

    return iv
  }

  function advanceAlert(id) {
    const a = state.alerts.find((x) => x.id === id)

    if (!a) return null

    const LIFECYCLE = ["open", "acknowledged", "resolved"]

    const next = LIFECYCLE[LIFECYCLE.indexOf(a.status) + 1]

    if (next) a.status = next

    return { ...a }
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

      scenarios: COMPETITION_SCENARIOS.map((id) => ({
        id,
        ...SCENARIO_META[id],
      })),

      kpis: kpis(),

      alerts: state.alerts,

      interventions: state.interventions,

      beforeAfter: beforeAfter(),
    }
  }

  reset("NORMAL")

  return {
    state,

    reset,

    step,

    tick: step,

    status,

    dashboard,

    machines,

    machine: (id) => machines().find((m) => m.id === id) ?? null,

    telemetry,

    analytics,

    alerts: () => state.alerts,

    addIntervention,

    advanceAlert,

    beforeAfter,
  }
}
