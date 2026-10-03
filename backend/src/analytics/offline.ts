/**
 * Engine ANALITICO - Offline (tempo sem mensagem).
 *
 * "Zero ausencia": quando nao ha mensagem, a leitura e MISSING -- nunca 0 kW.
 */

import type { DataQuality } from "../domain/value-objects/index.ts"
import { toNumber } from "../shared/utils/index.ts"

export interface OfflineResult {
  online: boolean
  quality: DataQuality
  minutesSilent: number
}

/**
 * Tempo tolerado (min) sem mensagem antes de considerar a maquina offline.
 * O simulador usa 2 (equivale ao passo 3 do cenario OFFLINE).
 */
export const OFFLINE_TOLERANCE_MINUTES = 2

export function offlineState(
  lastMessageAt: Date | null,
  now: Date,
  toleranceMinutes = OFFLINE_TOLERANCE_MINUTES,
): OfflineResult {
  if (!lastMessageAt) {
    return { online: false, quality: "MISSING", minutesSilent: Number.POSITIVE_INFINITY }
  }
  const minutesSilent = Number(((now.getTime() - lastMessageAt.getTime()) / 60000).toFixed(1))
  const online = minutesSilent <= toleranceMinutes && Number.isFinite(minutesSilent)
  return {
    online,
    quality: online ? "GOOD" : "MISSING",
    minutesSilent: Number.isFinite(minutesSilent) ? Math.max(0, minutesSilent) : minutesSilent,
  }
}

/** Evidencia textual do alerta de offline (contrato legado). */
export function offlineEvidence(step: number): string {
  const from = Math.max(0, toNumber(step) - 2)
  return `Sem mensagens desde o passo ${from}`
}

export function offlineAnomaly(step: number) {
  return {
    type: "Offline",
    severity: "high" as const,
    desc: "Ausência de telemetria (MISSING)",
    condition: offlineEvidence(step),
  }
}