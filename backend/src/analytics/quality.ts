/**
 * Engine ANALITICO - Qualidade dos dados (estados reais, secao 11).
 *
 * Zero NAO e ausencia: leituras ausentes entram como NULL/MISSING e nao
 * podem ser confundidas com potencia zero (decisao de conflito da secao 2).
 */

import type { ReadingsCounters } from "../domain/entities/index.ts"
import type { DataQuality } from "../domain/value-objects/index.ts"
import { toNumber } from "../shared/utils/index.ts"

export interface QualitySlice {
  label: DataQuality
  value: number
  color: string
}

const COLORS: Readonly<Record<DataQuality, string>> = {
  GOOD: "#16A34A",
  MISSING: "#9CA3AF",
  OUTLIER: "#D97706",
  DUPLICATE: "#BC0202",
}

/** Percentuais de qualidade a partir dos contadores brutos. */
export function dataQuality(readings: Partial<ReadingsCounters> = {}): QualitySlice[] {
  const good = toNumber(readings.good)
  const missing = toNumber(readings.missing)
  const outlier = toNumber(readings.outlier)
  const duplicate = toNumber(readings.duplicate)
  const total = good + missing + outlier + duplicate || 1
  const pct = (n: number) => Number(((n / total) * 100).toFixed(1))

  return [
    { label: "GOOD", value: pct(good), color: COLORS.GOOD },
    { label: "MISSING", value: pct(missing), color: COLORS.MISSING },
    { label: "OUTLIER", value: pct(outlier), color: COLORS.OUTLIER },
    { label: "DUPLICATE", value: pct(duplicate), color: COLORS.DUPLICATE },
  ]
}

/** Percentual de cobertura (leituras validas) - usado pelos setores. */
export function coveragePct(readings: Partial<ReadingsCounters> = {}): number {
  const good = toNumber(readings.good)
  const missing = toNumber(readings.missing)
  const outlier = toNumber(readings.outlier)
  const duplicate = toNumber(readings.duplicate)
  const total = good + missing + outlier + duplicate || 1
  return Number(((good / total) * 100).toFixed(1))
}

/** Classifica a qualidade de uma leitura recebida (sem transformar 0 em NULL). */
export function classifyReadingQuality(input: {
  hasValue: boolean
  duplicated?: boolean
  outlier?: boolean
}): DataQuality {
  if (!input.hasValue) return "MISSING"
  if (input.duplicated) return "DUPLICATE"
  if (input.outlier) return "OUTLIER"
  return "GOOD"
}

export function isUsableInAnalytics(quality: DataQuality): boolean {
  return quality === "GOOD" || quality === "OUTLIER"
}