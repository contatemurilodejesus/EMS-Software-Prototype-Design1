/**
 * EnergyMatrix EMS — store em memória.
 *
 * Mantém o estado operacional, aplica o domínio (server/ems.mjs) e simula a
 * telemetria (MQTT → store) para que o frontend receba dados "ao vivo".
 * Sem dependências externas — roda no Vite dev/preview ou standalone.
 */

import * as ems from "./ems.mjs"

import * as seed from "./seed.mjs"

import * as protocol from "./protocol.mjs"

import { createCompetition } from "./scenario.mjs"

const clone = (x) => JSON.parse(JSON.stringify(x))

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)

export function httpError(status, message) {
  const err = new Error(message)

  err.status = status

  return err
}

/** Curva de carga sintética de 24 h coerente com o estado da máquina. */

export function makeLoadCurve(m) {
  return Array.from({ length: 24 }, (_, h) => {
    let base = m.pOff

    const inShift = h >= 6 && h < 22

    if (m.state === "RUNNING")
      base = inShift ? m.pRun + (Math.random() - 0.5) * 4 : m.pOff
    else if (m.state === "IDLE")
      base = inShift
        ? m.pOff + (m.pRun - m.pOff) * 0.4 + (Math.random() - 0.5)
        : m.pOff
    else if (m.state === "ANOMALY")
      base = m.pRun * 1.6 + (Math.random() - 0.5) * 8

    return { h: `${h}h`, p: Math.max(0, Number(base.toFixed(1))) }
  })
}

export function createStore(options = {}) {
  const state = {
    startedAt: Date.now(),

    version: "2.0.0",

    plants: clone(seed.PLANTS),

    sectorMeta: clone(seed.SECTOR_META),

    machines: clone(seed.MACHINES),

    alerts: clone(seed.ALERTS),

    interventions: clone(seed.INTERVENTIONS),

    shifts: clone(seed.SHIFTS),

    gateways: clone(seed.GATEWAYS),

    readings: clone(seed.READINGS),

    gatewayHealth: clone(seed.GATEWAY_HEALTH),

    consumptionSeries: clone(seed.CONSUMPTION_SERIES),

    shiftData: clone(seed.SHIFT_DATA),

    costTrend: clone(seed.COST_TREND),

    machineBreakdown: clone(seed.MACHINE_BREAKDOWN),

    tariffProfile: clone(seed.TARIFF_PROFILE),

    opportunities: clone(seed.OPPORTUNITIES),

    tariff: clone(ems.DEFAULT_TARIFF),

    thresholds: clone(ems.THRESHOLDS),

    nonMonitoredKwhDay: seed.NON_MONITORED_KWH_DAY,

    protocols: clone(seed.PROTOCOLS),

    live: options.live !== false,

    tickCount: 0,

    lastTickAt: Date.now(),
  }

  /** Competition Mode — simulador determinístico de 3 máquinas. */

  const competition = createCompetition({ tariff: state.tariff })

  /** Deriva prazo/SLA de um protocolo a partir do domínio (server/protocol.mjs). */

  function decorateProtocol(p) {
    const deadline =
      p.deadline ?? protocol.computeDeadline(p.openedAt, p.priority)

    const view = {
      ...p,
      deadline,
      closedAt: p.closedAt ?? null,
      slaHours: protocol.SLA_HOURS[p.priority],
    }

    view.sla = protocol.slaState(view)

    view.slaLabel = protocol.slaLabel(view.sla)

    view.hoursToDeadline = protocol.hoursToDeadline(deadline)

    return view
  }

  /** Aplica o domínio a uma máquina: estado, anomalias, custo de IDLE. */

  function decorate(m) {
    const { state: st, anomalies } = ems.resolveState(m, state.thresholds)

    const isIdle = st === "IDLE"

    return {
      ...m,

      state: st,

      anomalies,

      anomalyDesc: anomalies.length
        ? anomalies.map((a) => a.desc).join(" · ")
        : undefined,

      idleMinutes: isIdle ? (m.idleMinutes ?? 0) : undefined,

      idleCostDay: isIdle
        ? (m.idleCostDay ?? ems.computeIdleCostDay(m.power, state.tariff))
        : undefined,
    }
  }

  /** Gera um alerta automaticamente a partir de uma anomalia recém-detectada. */

  function autoAlert(m) {
    const anomalies = m.anomalies ?? []

    if (!anomalies.length) return null

    const primary =
      anomalies.find((a) => a.severity === "critical") ?? anomalies[0]

    const seq =
      42 + state.alerts.filter((a) => a.id.startsWith("ALT-2026-")).length

    const alert = {
      id: `ALT-2026-${String(seq).padStart(4, "0")}`,

      machine: m.name,
      machineId: m.id,
      sector: m.sector,

      anomaly: primary.desc,
      anomalyType: primary.type,
      condition: primary.condition,

      peakTime: `${ems.fmtTime()} – contínuo`,
      severity: primary.severity,
      status: "open",

      action: "Acionar equipe de manutenção e inspecionar o equipamento.",

      detectedAt: ems.fmtDateTime(),
      auto: true,
    }

    state.alerts.unshift(alert)

    return alert
  }

  /** Avança a telemetria simulada em um passo (≈1 min de processo). */

  function tick() {
    const now = Date.now()

    const jitter = (v, pct) => v + v * pct * (Math.random() * 2 - 1)

    for (const m of state.machines) {
      const prev = m.state

      if (m.state !== "OFF") {
        const inService = m.power > m.pOff

        if (inService && m.state !== "ANOMALY") {
          m.voltage = Math.round(
            jitter(m.voltage || ems.NOMINAL_VOLTAGE, 0.004),
          )

          m.current = Number(jitter(m.current, 0.01).toFixed(1))
        }

        m.temperature = Math.round(jitter(m.temperature, 0.002))

        m.consumption = Number((m.consumption + (m.power || 0) / 60).toFixed(1))

        m.lastUpdate = ems.fmtTime(new Date(now))
      }

      if (m.state === "IDLE") m.idleMinutes = (m.idleMinutes ?? 0) + 1

      const dec = decorate(m)

      if (dec.state === "ANOMALY" && prev && prev !== "ANOMALY") autoAlert(dec)

      m.state = dec.state
    }

    const livePower = Math.round(
      state.machines.reduce((s, m) => s + (m.power || 0), 0),
    )

    const last = state.consumptionSeries[state.consumptionSeries.length - 1]

    if (last) last.consumo = livePower

    state.tickCount += 1

    state.lastTickAt = now

    // O Competition Mode também avança um passo determinístico por ciclo.

    if (state.competitionAutoStep !== false) competition.tick()
  }

  const resolveMachine = (id) => {
    const raw = state.machines.find((m) => m.id === id)

    return raw ? decorate(raw) : null
  }

  return {
    state,

    tick,

    decorate,

    httpError,

    /* ---------------- Plantas ---------------- */

    getPlants() {
      return clone(state.plants)
    },

    /* ---------------- Máquinas ---------------- */

    getMachines(query = {}) {
      let list = state.machines.map(decorate)

      if (query.state && query.state !== "all") {
        const q = String(query.state).toUpperCase()

        list = list.filter((m) => m.state === q)
      }

      if (query.sector) list = list.filter((m) => m.sector === query.sector)

      return list
    },

    getMachine(id) {
      const m = resolveMachine(id)

      return m ? { ...m, loadCurve: makeLoadCurve(m) } : null
    },

    addMachine(input = {}) {
      if (!input.id) throw httpError(400, 'Campo "id" é obrigatório')

      if (state.machines.some((m) => m.id === input.id))
        throw httpError(409, `Máquina ${input.id} já existe`)

      const m = {
        id: String(input.id),
        name: input.name ?? input.id,
        type: input.type ?? "Geral",

        sector: input.sector ?? "Setor A",
        gateway: input.gateway ?? "GW-SP01",

        nominalKW: num(input.nominalKW) || 10,
        pOff: num(input.pOff) || 1,
        pRun: num(input.pRun) || 5,

        voltage: num(input.voltage) || ems.NOMINAL_VOLTAGE,
        current: num(input.current),

        power: num(input.power),
        consumption: num(input.consumption),

        temperature: num(input.temperature) || 25,
        powerFactor: num(input.powerFactor) || 0.92,

        coverage: num(input.coverage) || 100,
        lastUpdate: ems.fmtTime(),
      }

      state.machines.push(m)

      return decorate(m)
    },

    updateMachine(id, patch = {}) {
      const m = state.machines.find((x) => x.id === id)

      if (!m) return null

      const fields = [
        "name",
        "type",
        "sector",
        "gateway",
        "nominalKW",
        "pOff",
        "pRun",
        "coverage",
      ]

      for (const f of fields) if (patch[f] !== undefined) m[f] = patch[f]

      return decorate(m)
    },

    removeMachine(id) {
      const i = state.machines.findIndex((m) => m.id === id)

      if (i < 0) return false

      state.machines.splice(i, 1)

      return true
    },

    /* ---------------- Setores ---------------- */

    getSectors() {
      return ems.aggregateSectors(
        state.machines.map(decorate),
        state.tariff,
        state.sectorMeta,
      )
    },

    /* ---------------- Alertas ---------------- */

    getAlerts(query = {}) {
      let list = clone(state.alerts)

      if (query.severity && query.severity !== "all")
        list = list.filter((a) => a.severity === query.severity)

      if (query.status && query.status !== "all")
        list = list.filter((a) => a.status === query.status)

      return list
    },

    advanceAlert(id, { assignee } = {}) {
      const a = state.alerts.find((x) => x.id === id)

      if (!a) return null

      const LIFECYCLE = ["open", "acknowledged", "resolved"]

      const next = LIFECYCLE[LIFECYCLE.indexOf(a.status) + 1]

      if (!next) return clone(a)

      a.status = next

      if (next === "acknowledged") {
        a.acknowledgedAt = ems.fmtDateTime()
        a.assignee = assignee ?? a.assignee ?? "Operador EMS"
      }

      if (next === "resolved") {
        a.resolvedAt = ems.fmtDateTime()
        a.assignee = assignee ?? a.assignee ?? "Operador EMS"
      }

      return clone(a)
    },

    getAlertsSummary() {
      const active = (a) => a.status !== "resolved"

      return {
        total: state.alerts.length,

        openCritical: state.alerts.filter(
          (a) => a.severity === "critical" && active(a),
        ).length,

        openIdle: state.alerts.filter(
          (a) => a.anomalyType === "Consumo Improdutivo" && active(a),
        ).length,

        bySeverity: {
          critical: state.alerts.filter(
            (a) => a.severity === "critical" && active(a),
          ).length,

          high: state.alerts.filter((a) => a.severity === "high" && active(a))
            .length,

          medium: state.alerts.filter(
            (a) => a.severity === "medium" && active(a),
          ).length,
        },
      }
    },

    /* ---------------- Intervenções / Economia ---------------- */

    getInterventions() {
      return clone(state.interventions)
    },

    addIntervention(input = {}) {
      if (!input.machine) throw httpError(400, 'Campo "machine" é obrigatório')

      const before = num(input.before)

      const after = num(input.after)

      const seq = 15 + state.interventions.length

      const iv = {
        id: `INT-${String(seq).padStart(3, "0")}`,

        date: input.date ?? ems.fmtDateTime().slice(0, 5),

        machine: input.machine,

        desc: input.desc ?? "Intervenção registrada",

        before,
        after,
        saved: Math.max(0, before - after),

        period: input.period ?? "período atual",

        confidence: input.confidence ?? "estimado",

        status: "active",
      }

      state.interventions.unshift(iv)

      return iv
    },

    getCusum() {
      const days = 28

      const out = []

      for (let i = 0; i < days; i += 1) {
        const day = i + 1

        const interv = day >= 8

        out.push({
          dia: day,

          economy: interv ? Math.round(Math.max(0, (day - 7) * 43.7)) : 0,

          baseline: Math.round(580 + Math.sin(i * 0.4) * 30),

          medido: Math.round(
            interv
              ? 540 + Math.sin(i * 0.4) * 25 - (day - 7) * 1.8
              : 578 + Math.sin(i * 0.4) * 40,
          ),
        })
      }

      return out
    },

    getEconomy() {
      const cusum = this.getCusum()

      const interventions = this.getInterventions()

      return {
        cusum,

        opportunities: clone(state.opportunities),

        interventions,

        totals: {
          savingsAccumulated: cusum[cusum.length - 1]?.economy ?? 0,

          opportunityMonth: state.opportunities.reduce(
            (s, o) => s + o.costMonth,
            0,
          ),

          activeSavings: interventions.reduce((s, i) => s + i.saved, 0),

          tariff: state.tariff,
        },
      }
    },

    /* ---------------- Relatórios ---------------- */

    getReports() {
      return {
        shiftData: clone(state.shiftData),

        costTrend: clone(state.costTrend),

        machineBreakdown: clone(state.machineBreakdown),

        tariffProfile: clone(state.tariffProfile),

        tariff: clone(state.tariff),
      }
    },

    /* ---------------- Administração ---------------- */

    getTariff() {
      return clone(state.tariff)
    },

    setTariff(patch = {}) {
      for (const k of [
        "offPeak",
        "intermediate",
        "peak",
        "contractedDemandKW",
        "excessDemandPenalty",
      ]) {
        if (patch[k] !== undefined) state.tariff[k] = num(patch[k])
      }

      return clone(state.tariff)
    },

    getThresholds() {
      return clone(state.thresholds)
    },

    setThresholds(patch = {}) {
      for (const k of Object.keys(state.thresholds)) {
        if (patch[k] !== undefined) state.thresholds[k] = num(patch[k])
      }

      return clone(state.thresholds)
    },

    getShifts() {
      return clone(state.shifts)
    },

    toggleShift(id) {
      const s = state.shifts.find((x) => x.id === id)

      if (!s) return null

      s.active = !s.active

      return clone(s)
    },

    getAdmin() {
      return {
        machines: state.machines.map((m) => ({
          id: m.id,
          name: m.name,
          sector: m.sector,
          gateway: m.gateway,

          pOff: m.pOff,
          pRun: m.pRun,
          nominal: m.nominalKW,
        })),

        tariffs: clone(state.tariff),

        shifts: clone(state.shifts),

        gatewayHealth: clone(state.gatewayHealth),

        thresholds: clone(state.thresholds),
      }
    },

    /* ---------------- Competition Mode (demo determinístico) ---------------- */

    getCompetition() {
      return {
        ...competition.status(),

        machines: competition.machines(),

        analytics: competition.analytics(),
      }
    },

    getCompetitionDashboard() {
      return competition.dashboard()
    },

    getCompetitionMachines() {
      return competition.machines()
    },

    getCompetitionMachine(id) {
      return competition.machine(id)
    },

    getCompetitionTelemetry(id) {
      return competition.telemetry(id)
    },

    getCompetitionAnalytics() {
      return competition.analytics()
    },

    setCompetitionScenario(name) {
      return competition.reset(name)
    },

    resetCompetition() {
      return competition.reset("NORMAL")
    },

    stepCompetition() {
      return competition.step()
    },

    addCompetitionIntervention(input) {
      return competition.addIntervention(input)
    },

    advanceCompetitionAlert(id) {
      return competition.advanceAlert(id)
    },

    /* ---------------- Protocolos (módulo protocolar) ---------------- */

    getProtocols(query = {}) {
      let list = state.protocols.map(decorateProtocol)

      if (query.status && query.status !== "all")
        list = list.filter((p) => p.status === query.status)

      if (query.priority && query.priority !== "all")
        list = list.filter((p) => p.priority === query.priority)

      if (query.sla && query.sla !== "all")
        list = list.filter((p) => p.sla === query.sla)

      return list
    },

    getProtocol(id) {
      const p = state.protocols.find((x) => x.id === id)

      return p ? decorateProtocol(p) : null
    },

    addProtocol(input = {}) {
      const year = new Date().getFullYear()

      const seq = protocol.nextSequence(state.protocols, year)

      const p = {
        id: protocol.protocolNumber(year, seq),

        title: input.title ?? "Ocorrência registrada",

        machineId: input.machineId ?? "",

        machine: input.machine ?? "",

        sector: input.sector ?? "",

        origin: protocol.PROTOCOL_ORIGINS.includes(input.origin)
          ? input.origin
          : "Outro",

        priority: protocol.PROTOCOL_PRIORITIES.includes(input.priority)
          ? input.priority
          : "medium",

        status: "open",

        alertId: input.alertId ?? null,

        assignee: input.assignee ?? "Operador EMS",

        description: input.description ?? "",

        openedAt: protocol.isoLocal(),

        evidence: Array.isArray(input.evidence) ? input.evidence : [],

        events: [
          protocol.makeEvent(
            "abertura",
            input.actor,
            input.note ?? "Protocolo aberto.",
          ),
        ],
      }

      state.protocols.unshift(p)

      return decorateProtocol(p)
    },

    advanceProtocol(id, { status, actor, note } = {}) {
      const p = state.protocols.find((x) => x.id === id)

      if (!p) return null

      const LIFECYCLE = ["open", "in_progress", "pending_validation", "closed"]

      let next = protocol.PROTOCOL_STATUSES.includes(status)
        ? status
        : LIFECYCLE[LIFECYCLE.indexOf(p.status) + 1]

      if (!next) return decorateProtocol(p)

      p.status = next

      if (next === "closed") p.closedAt = protocol.isoLocal()

      const eventType =
        {
          open: "abertura",
          in_progress: "tratativa",
          pending_validation: "validação",

          closed: "encerramento",
          cancelled: "cancelamento",
        }[next] ?? "comentário"

      p.events.push(protocol.makeEvent(eventType, actor, note))

      return decorateProtocol(p)
    },

    addProtocolEvent(id, { type, actor, note } = {}) {
      const p = state.protocols.find((x) => x.id === id)

      if (!p) return null

      const kind = protocol.PROTOCOL_EVENT_TYPES.includes(type)
        ? type
        : "comentário"

      p.events.push(protocol.makeEvent(kind, actor, note))

      return decorateProtocol(p)
    },

    getProtocolsSummary() {
      const list = state.protocols.map(decorateProtocol)

      const active = (p) => p.status !== "closed" && p.status !== "cancelled"

      return {
        total: list.length,

        open: list.filter((p) => active(p)).length,

        byStatus: {
          open: list.filter((p) => p.status === "open").length,

          in_progress: list.filter((p) => p.status === "in_progress").length,

          pending_validation: list.filter(
            (p) => p.status === "pending_validation",
          ).length,

          closed: list.filter((p) => p.status === "closed").length,

          cancelled: list.filter((p) => p.status === "cancelled").length,
        },

        bySla: {
          running: list.filter((p) => p.sla === "running").length,

          at_risk: list.filter((p) => p.sla === "at_risk").length,

          breached: list.filter((p) => p.sla === "breached").length,

          met: list.filter((p) => p.sla === "met").length,
        },

        criticalOpen: list.filter((p) => p.priority === "critical" && active(p))
          .length,
      }
    },

    /* ---------------- Visão da Fábrica (summary) ---------------- */

    getSummary() {
      const machines = this.getMachines()

      const sectors = this.getSectors()

      const plant = state.plants[0]

      const totals = {
        kwh: Math.round(sectors.reduce((s, x) => s + x.kwh, 0)),

        cost: Math.round(sectors.reduce((s, x) => s + x.cost, 0)),

        idleCost: Math.round(sectors.reduce((s, x) => s + x.idleCost, 0)),

        idleMachines: machines.filter((m) => m.state === "IDLE").length,

        running: machines.filter((m) => m.state === "RUNNING").length,

        anomaly: machines.filter((m) => m.state === "ANOMALY").length,

        off: machines.filter((m) => m.state === "OFF").length,

        alerts: this.getAlertsSummary().total,
      }

      return {
        plant,
        demandLimitKW: plant.demandLimitKW,
        totals,

        sectors,

        consumption: clone(state.consumptionSeries),

        dataQuality: ems.dataQuality(state.readings),

        gateways: clone(state.gateways),

        nonMonitoredKwhDay: state.nonMonitoredKwhDay,

        livePower: machines.reduce((s, m) => s + (m.power || 0), 0).toFixed(1),

        timestamp: ems.fmtDateTime(),
      }
    },

    /* ---------------- Saúde / metadados ---------------- */

    getHealth() {
      const machines = this.getMachines()

      return {
        status: "ok",

        service: "energymatrix-ems-api",

        version: state.version,

        uptimeSeconds: Math.round((Date.now() - state.startedAt) / 1000),

        live: state.live,

        tickCount: state.tickCount,

        lastTickAt: ems.fmtDateTime(new Date(state.lastTickAt)),

        machines: machines.length,

        alertsOpen: state.alerts.filter((a) => a.status !== "resolved").length,
      }
    },
  }
}
