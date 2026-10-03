/**
 * Engine ANALITICO - Anomalias (secao 11 do documento).
 *
 * Regras extraidas do dominio legado, agora funcoes puras sem HTTP/banco.
 * Nao afirmam falha especifica: produzem EVIDENCIA (descricao + condicao).
 */

import type { Anomaly, MachineSignal, Thresholds } from "../domain/entities/index.ts"
import { toNumber } from "../shared/utils/index.ts"

/** Tensao trifasica nominal da planta (V). */
export const NOMINAL_VOLTAGE = 380

/** Limiares de diagnostico - ajustaveis via Admin (/api/admin/thresholds). */
export const DEFAULT_THRESHOLDS: Thresholds = {
  temperatureCriticalC: 85,
  temperatureWarnC: 80,
  powerFactorMin: 0.85,
  voltageTolerancePct: 5,
  overcurrentFactor: 1.3,
  idleMinutesWarn: 30,
  demandNominalKW: 480,
}

/** Corrente nominal estimada (A) - trifasico 380 V, FP nominal 0,92. */
export function nominalCurrent(
  nominalKW: number,
  voltage = NOMINAL_VOLTAGE,
  pf = 0.92,
): number {
  const v = toNumber(voltage, NOMINAL_VOLTAGE) || NOMINAL_VOLTAGE
  return (toNumber(nominalKW) * 1000) / (Math.sqrt(3) * v * pf)
}

/**
 * Desvio percentual sobre a baseline: ((atual - baseline) / baseline) x 100.
 * Exemplo do documento: baseline 8 kW e atual 12 kW -> +50%.
 */
export function deviationPctFromBaseline(current: number, baseline: number): number {
  const b = toNumber(baseline)
  if (b <= 0) return 0
  return ((toNumber(current) - b) / b) * 100
}

/** Executa as regras de diagnostico e devolve a lista de anomalias ativas. */
export function detectAnomalies(
  signal: MachineSignal,
  thresholds: Thresholds = DEFAULT_THRESHOLDS,
): Anomaly[] {
  const out: Anomaly[] = []
  const power = toNumber(signal.power)
  const inService = power > toNumber(signal.pOff)
  const temp = toNumber(signal.temperature)
  const pf = toNumber(signal.powerFactor)
  const v = toNumber(signal.voltage)

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
    const iNom = nominalCurrent(signal.nominalKW, v)
    const limit = iNom * thresholds.overcurrentFactor
    if (iNom > 0 && toNumber(signal.current) > limit) {
      out.push({
        type: "Sobrecarga",
        severity: "critical",
        desc: "Sobrecorrente",
        condition: `I = ${toNumber(signal.current).toFixed(1)} A > ${limit.toFixed(1)} A (1,3× nominal ${iNom.toFixed(1)} A)`,
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

/** Anomalia de desvio sobre a baseline (evidencia, nao diagnostico de falha). */
export function anomalyFromBaseline(
  power: number,
  baselineKw: number,
  tolerancePct: number,
): Anomaly | null {
  const dev = deviationPctFromBaseline(power, baselineKw)
  if (dev <= tolerancePct) return null
  return {
    type: "Anomalia de Consumo",
    severity: "critical",
    desc: `Consumo acima da baseline (+${dev.toFixed(0)}%)`,
    condition: `P = ${power} kW vs baseline ${baselineKw} kW → desvio +${dev.toFixed(0)}%`,
  }
}