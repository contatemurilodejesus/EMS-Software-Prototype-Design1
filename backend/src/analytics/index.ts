/**
 * Engine ANALITICO - barramento publico dos motores (funcoes puras).
 *
 * Regra de dependencia: `analytics` depende de `domain` e de utilitarios
 * puros. Nunca de Express, PostgreSQL ou do relogio do sistema.
 */

export * from "./anomaly.ts"
export * from "./cost.ts"
export * from "./energy.ts"
export * from "./idle.ts"
export * from "./offline.ts"
export * from "./quality.ts"
export * from "./sectors.ts"
export * from "./state.ts"
export * from "./thermal.ts"