/**
 * EnergyMatrix EMS - utilitarios puros de formato e tempo.
 *
 * Nenhuma dependencia de HTTP/banco. As funcoes de data recebem a data por
 * parametro (nunca leem o relogio do sistema por conta propria, exceto nos
 * defaults - que sao sempre sobrescritos pelo `Clock` injetado nos services).
 */

export function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

/** dd/mm/aaaa hh:mm (formato usado pelo frontend). */
export function formatDateTime(date: Date): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** hh:mm. */
export function formatTime(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** ISO local (aaaa-mm-ddThh:mm:ss) - base da aritmetica de SLA. */
export function formatIsoLocal(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

/** Converte texto ISO em Date (fallback: `fallback`). */
export function parseIso(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3600 * 1000)
}

export function hoursBetween(from: Date, to: Date): number {
  return Number(((to.getTime() - from.getTime()) / 3_600_000).toFixed(1))
}

export function toNumber(value: unknown, fallback = 0): number {
  return Number.isFinite(Number(value)) ? Number(value) : fallback
}

export function round1(value: number): number {
  return Number((Number(value) || 0).toFixed(1))
}

export function round0(value: number): number {
  return Math.round(Number(value) || 0)
}

/** Copia profunda via JSON - mantem o comportamento do store legado. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}