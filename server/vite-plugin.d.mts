export interface EmsApiPluginOptions {
  /** Habilita a simulação de telemetria (default: true). */

  live?: boolean

  /** Intervalo (ms) entre passos de telemetria simulada (default: 5000). */

  tickIntervalMs?: number
}

/**
 * Plugin Vite que expõe o backend EnergyMatrix EMS em `/api/*` no próprio
 * dev/preview server do Vite.
 */

export function emsApiPlugin(
  options?: EmsApiPluginOptions,
): import("vite").Plugin

export default emsApiPlugin
