/**
 * EnergyMatrix EMS — núcleo de domínio (energia / máquina / custo / diagnóstico).
 *
 * Funções puras compartilhadas entre o servidor standalone (server/index.mjs) e o
 * middleware de desenvolvimento/preview do Vite (server/vite-plugin.mjs).
 */

export const MACHINE_STATES = ["OFF", "IDLE", "RUNNING", "ANOMALY"]

export const ALERT_SEVERITIES = ["critical", "high", "medium"]

export const ALERT_STATUSES = ["open", "acknowledged", "resolved"]

/** Tensão trifásica nominal da planta (V). */

export const NOMINAL_VOLTAGE = 380

/** Limiares de diagnóstico — ajustáveis via Admin (/api/admin/thresholds). */

export const THRESHOLDS = {
  temperatureCriticalC: 85,

  temperatureWarnC: 80,

  powerFactorMin: 0.85,

  voltageTolerancePct: 5,

  overcurrentFactor: 1.3,

  idleMinutesWarn: 30,

  demandNominalKW: 480,
}

/**
 * Classifica o estado a partir da potência ativa instantânea (kW).
 *   OFF     → P ≤ P_off
 *   IDLE    → P_off < P < P_run   (em serviço, sem produção)
 *   RUNNING → P ≥ P_run
 * ANOMALY é aplicado por cima por {@link detectAnomalies}.
 */

export function classifyState(power, pOff, pRun) {
  const p = Number(power) || 0

  if (p <= (Number(pOff) || 0)) return "OFF"

  if (p < (Number(pRun) || 0)) return "IDLE"

  return "RUNNING"
}

/** Corrente nominal estimada (A) — trifásico 380 V, FP nominal 0,92. */

export function nominalCurrent(
  nominalKW,
  voltage = NOMINAL_VOLTAGE,
  pf = 0.92,
) {
  const v = Number(voltage) || NOMINAL_VOLTAGE

  return ((Number(nominalKW) || 0) * 1000) / (Math.sqrt(3) * v * pf)
}

/** Executa as regras de diagnóstico e devolve a lista de anomalias ativas. */

export function detectAnomalies(m, thresholds = THRESHOLDS) {
  const out = []

  const power = Number(m.power) || 0

  const pOff = Number(m.pOff) || 0

  const inService = power > pOff

  const temp = Number(m.temperature) || 0

  const pf = Number(m.powerFactor) || 0

  const v = Number(m.voltage) || 0

  if (inService && temp > thresholds.temperatureCriticalC) {
    out.push({
      type: "Temperatura",
      severity: "critical",

      desc: `Temperatura crítica (${temp}°C)`,

      condition: `T = ${temp}°C > limite ${thresholds.temperatureCriticalC}°C`,
    })
  }

  if (inService && pf > 0 && pf < thresholds.powerFactorMin) {
    out.push({
      type: "Qualidade de Energia",
      severity: "high",

      desc: `Fator de potência baixo (FP = ${pf.toFixed(2)})`,

      condition: `FP = ${pf.toFixed(2)} < ${thresholds.powerFactorMin} — risco de multa por reativo`,
    })
  }

  if (inService) {
    const iNom = nominalCurrent(m.nominalKW, v)

    const lim = iNom * thresholds.overcurrentFactor

    if (iNom > 0 && Number(m.current) > lim) {
      out.push({
        type: "Sobrecarga",
        severity: "critical",

        desc: "Sobrecorrente",

        condition: `I = ${Number(m.current).toFixed(1)} A > ${lim.toFixed(1)} A (1,3× nominal ${iNom.toFixed(1)} A)`,
      })
    }
  }

  if (inService && v > 0) {
    const dev = ((v - NOMINAL_VOLTAGE) / NOMINAL_VOLTAGE) * 100

    if (Math.abs(dev) > thresholds.voltageTolerancePct) {
      out.push({
        type: "Qualidade de Energia",
        severity: "high",

        desc: `Variação de tensão (${dev > 0 ? "+" : ""}${dev.toFixed(1)}%)`,

        condition: `V = ${v} V (${dev.toFixed(1)}% vs nominal ${NOMINAL_VOLTAGE} V)`,
      })
    }
  }

  return out
}

/** Deriva o estado final considerando as anomalias ativas. */

export function resolveState(m, thresholds = THRESHOLDS) {
  const base = classifyState(m.power, m.pOff, m.pRun)

  const anomalies = detectAnomalies(m, thresholds)

  const hasCritical = anomalies.some((a) => a.severity === "critical")

  return { state: hasCritical ? "ANOMALY" : base, anomalies }
}

/** Tarifa horária ANEEL (R$/kWh) — perfil padrão do setor industrial. */

export const DEFAULT_TARIFF = {
  offPeak: 0.42,

  intermediate: 0.78,

  peak: 2.21,

  contractedDemandKW: 480,

  excessDemandPenalty: 45.8,

  schedule: {
    offPeak: [
      [0, 17],
      [21, 24],
    ],

    intermediate: [
      [17, 18],
      [21, 22],
    ],

    peak: [[18, 21]],
  },
}

function inRanges(hour, ranges) {
  return ranges.some(([a, b]) => hour >= a && hour < b)
}

/** Faixa tarifária de uma hora (0–23): 'offPeak' | 'intermediate' | 'peak'. */

export function tariffPeriodForHour(hour, tariff = DEFAULT_TARIFF) {
  const h = ((Number(hour) % 24) + 24) % 24

  const s = tariff.schedule ?? DEFAULT_TARIFF.schedule

  if (inRanges(h, s.peak)) return "peak"

  if (inRanges(h, s.intermediate)) return "intermediate"

  return "offPeak"
}

/** Tarifa (R$/kWh) de uma hora (0–23). */

export function rateForHour(hour, tariff = DEFAULT_TARIFF) {
  return Number(tariff[tariffPeriodForHour(hour, tariff)]) || 0
}

/** Tarifa média ponderada das 24 h — base para estimativas de custo. */

export function blendedRate(tariff = DEFAULT_TARIFF) {
  let sum = 0

  for (let h = 0; h < 24; h += 1) sum += rateForHour(h, tariff)

  return sum / 24
}

/** Custo total (R$) de uma série de consumo (kWh) por hora do dia. */

export function costFromLoad(series, tariff = DEFAULT_TARIFF) {
  return (series ?? []).reduce((acc, point, i) => {
    const hour = typeof point?.hour === "number" ? point.hour : i

    return acc + (Number(point?.kwh) || 0) * rateForHour(hour, tariff)
  }, 0)
}

/**
 * Custo estimado (R$/dia) de operação em IDLE.
 * Fórmula: P_idle (kW) × horas de operação/dia × tarifa média ponderada.
 */

export function computeIdleCostDay(
  power,
  tariff = DEFAULT_TARIFF,
  operationalHours = 16,
) {
  return Math.round(
    (Number(power) || 0) * operationalHours * blendedRate(tariff),
  )
}

/** Percentuais de qualidade de dados a partir de contadores brutos. */

export function dataQuality(readings = {}) {
  const good = Number(readings.good) || 0

  const missing = Number(readings.missing) || 0

  const outlier = Number(readings.outlier) || 0

  const duplicate = Number(readings.duplicate) || 0

  const total = good + missing + outlier + duplicate || 1

  const pct = (n) => Number(((n / total) * 100).toFixed(1))

  return [
    { label: "GOOD", value: pct(good), color: "#16A34A" },

    { label: "MISSING", value: pct(missing), color: "#9CA3AF" },

    { label: "OUTLIER", value: pct(outlier), color: "#D97706" },

    { label: "DUPLICATE", value: pct(duplicate), color: "#BC0202" },
  ]
}

export function pad2(n) {
  return String(n).padStart(2, "0")
}

/** Data/hora no formato dd/mm/yyyy hh:mm. */

export function fmtDateTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)

  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** Hora no formato hh:mm. */

export function fmtTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date)

  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** Agrega máquinas em setores (counts, kWh, custo, cobertura). */

export function aggregateSectors(
  machines,
  tariff = DEFAULT_TARIFF,
  sectorMeta = [],
) {
  const byName = new Map()

  for (const m of machines) {
    if (!byName.has(m.sector)) {
      byName.set(m.sector, {
        name: m.sector,
        machines: 0,
        running: 0,
        idle: 0,
        off: 0,
        anomaly: 0,
        kwh: 0,
        idleCost: 0,
        coverageSum: 0,
        weighted: 0,
      })
    }

    const s = byName.get(m.sector)

    s.machines += 1

    s.kwh += Number(m.consumption) || 0

    s.coverageSum += Number(m.coverage) || 0

    s.weighted += (Number(m.consumption) || 0) * blendedRate(tariff)

    const st = String(m.state || "").toUpperCase()

    if (st === "ANOMALY") {
      s.anomaly += 1
      s.running += 1
    } else if (st === "RUNNING") s.running += 1
    else if (st === "IDLE") s.idle += 1
    else s.off += 1

    if (st === "IDLE") s.idleCost += Number(m.idleCostDay) || 0
  }

  return [...byName.values()].map((s) => {
    const meta = sectorMeta.find((x) => x.name === s.name) || {}

    return {
      id: meta.id ?? (s.name.replace(/^Setor\s*/i, "").trim() || s.name),

      name: s.name,

      machines: s.machines,

      running: s.running,

      idle: s.idle,

      off: s.off,

      anomaly: s.anomaly,

      kwh: Math.round(s.kwh),

      cost: Math.round(s.weighted),

      idleCost: Math.round(s.idleCost),

      coverage: s.machines ? Math.round(s.coverageSum / s.machines) : 100,
    }
  })
}
