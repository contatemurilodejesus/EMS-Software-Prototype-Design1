import type { Plugin } from "vite"

export interface EmsApiPluginOptions {
  /**
   * Sobreposicoes do ambiente do backend (persistence, live, logLevel...).
   * Sem isso, vale o que vier de `.env` e dos padroes de `config/environment.ts`.
   */
  env?: Record<string, string>

  /** Prefixo da API montada no dev/preview server (default: `/api`). */
  apiPrefix?: string
}

/**
 * Plugin Vite que expoe o backend Express OFICIAL do EnergyMatrix em `/api/*`
 * durante `vite dev` e `vite preview`.
 *
 * Nao contem regra de negocio e nao duplica rotas: encaminha ao mesmo Express
 * usado em producao, por um socket local efemero.
 */
export function emsApiPlugin(options?: EmsApiPluginOptions): Plugin

export default emsApiPlugin