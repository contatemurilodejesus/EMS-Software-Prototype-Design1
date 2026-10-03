/**
 * EnergyMatrix EMS - relogio injetavel.
 *
 * Engines analiticos e o simulador NAO leem o relogio do sistema: recebem
 * um `Clock`. Isso mantem a demonstracao determinística e os testes estaveis.
 */

import type { Clock } from "../domain/ports/index.ts"

/** Relogio real (producao). */
export function createSystemClock(): Clock {
  return {
    now: () => new Date(),
    nowMs: () => Date.now(),
  }
}

/**
 * Relogio virtual - avanca apenas por chamada explicita.
 * Usado pelos testes de determinismo e pelo modo de demonstracao offline.
 */
export function createVirtualClock(start: Date = new Date("2026-10-02T14:00:00Z")) {
  let current = start.getTime()

  return {
    now: (): Date => new Date(current),
    nowMs: (): number => current,
    advanceMs(ms: number): void {
      current += ms
    },
    advanceMinutes(minutes: number): void {
      current += minutes * 60_000
    },
    set(instant: Date): void {
      current = instant.getTime()
    },
  }
}

export type VirtualClock = ReturnType<typeof createVirtualClock>