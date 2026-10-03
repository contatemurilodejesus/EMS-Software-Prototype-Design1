/**
 * Filtro de TENANT dos repositories em memoria (secao 7.1).
 *
 * `currentTenantIdOrNull()` devolve o tenant do token validado. Quando nao ha
 * contexto autenticado (jobs de demonstracao, watchdog, seed), o filtro nao e
 * aplicado - o job ja recebe o tenant explicito (secao 7.1, item 5).
 */

import { currentTenantIdOrNull } from "../../../shared/tenant-context.ts"

export interface TenantScoped {
  tenantId?: string | null
}

/** Verdadeiro quando o registro pertence ao tenant do contexto. */
export function belongsToTenant(record: TenantScoped): boolean {
  const tenantId = currentTenantIdOrNull()
  if (!tenantId) return true
  return record.tenantId === tenantId
}

/** Filtro reusable para listas. */
export function tenantFilter<T extends TenantScoped>(records: T[]): T[] {
  const tenantId = currentTenantIdOrNull()
  if (!tenantId) return records
  return records.filter((record) => record.tenantId === tenantId)
}