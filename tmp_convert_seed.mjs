/**
 * TEMPORARIO - converte os dados-semente legados (server/seed.mjs) para um
 * modulo TypeScript tipado em backend/src/database/seeds/seed-data.ts.
 * Uso: node tmp_convert_seed.mjs
 */
import fs from "node:fs"
import * as seed from "./server/seed.mjs"

const TARGET = "backend/src/database/seeds/seed-data.ts"

const MAP = [
  ["PLANTS", "Plant[]", "plantas"],
  ["SECTOR_META", "SectorMeta[]", "metadados de setor"],
  ["MACHINES", "MachineRecord[]", "maquinas monitoradas"],
  ["ALERTS", "Alert[]", "alertas historicos"],
  ["INTERVENTIONS", "Intervention[]", "intervencoes"],
  ["SHIFTS", "Shift[]", "turnos"],
  ["GATEWAYS", "Gateway[]", "gateways"],
  ["GATEWAY_HEALTH", "GatewayHealth[]", "indicadores de saude dos gateways"],
  ["READINGS", "ReadingsCounters", "contadores de qualidade"],
  ["CONSUMPTION_SERIES", "ConsumptionPoint[]", "curva 24h"],
  ["SHIFT_DATA", "Record<string, string | number>[]", "consumo por turno"],
  ["COST_TREND", "Record<string, string | number>[]", "custo x meta"],
  ["MACHINE_BREAKDOWN", "Record<string, string | number>[]", "consumo por maquina"],
  ["TARIFF_PROFILE", "Record<string, string | number>[]", "perfil tarifario 24h"],
  ["OPPORTUNITIES", "Record<string, string | number>[]", "oportunidades de economia"],
  ["PROTOCOLS", "Protocol[]", "protocolos seed"],
]

const j = (value) => JSON.stringify(value, null, 2).replace(/\n/g, "\n")

const lines = [
  "/**",
  " * EnergyMatrix EMS - dados-semente deterministicos (Planta SP - Guarulhos).",
  " *",
  " * GERADO a partir dos dados historicos do prototipo (server/seed.mjs) para",
  " * preservar exatamente os contratos atuais da API. Sem dados aleatorios:",
  " * as migrations criam o schema e o seed (`seeds/seed.ts`) insere estes valores",
  " * de forma idempotente (ON CONFLICT DO NOTHING).",
  " */",
  "",
  'import type {',
  "  Alert,",
  "  ConsumptionPoint,",
  "  Gateway,",
  "  GatewayHealth,",
  "  Intervention,",
  "  MachineRecord,",
  "  Plant,",
  "  Protocol,",
  "  ReadingsCounters,",
  "  SectorMeta,",
  "  Shift,",
  '} from "../../domain/entities/index.ts"',
  "",
]

const names = []
for (const [name, type, description] of MAP) {
  const value = seed[name]
  if (value === undefined) {
    console.error(`!! export ausente no seed legado: ${name}`)
    continue
  }
  names.push(name)
  lines.push(`/** ${description} */`)
  lines.push(`export const ${name}: ${type} = ${j(value)}`)
  lines.push("")
}

lines.push("/** kWh/dia sem monitoramento (rotulado como estimativa). */")
lines.push(`export const NON_MONITORED_KWH_DAY: number = ${JSON.stringify(seed.NON_MONITORED_KWH_DAY ?? 0)}`)
lines.push("")

fs.mkdirSync("backend/src/database/seeds", { recursive: true })
fs.writeFileSync(TARGET, lines.join("\n"), "utf8")

const keySets = {}
for (const name of names) {
  const value = seed[name]
  if (Array.isArray(value)) {
    keySets[name] = [...new Set(value.flatMap((item) => Object.keys(item ?? {})))].sort()
  }
}

console.log("gerado:", TARGET, "| exports:", names.length)
console.log(JSON.stringify(keySets, null, 1))
if (Array.isArray(seed.READINGS)) console.log("READINGS e array (esperado objeto)")
console.log("READINGS keys:", Object.keys(seed.READINGS ?? {}))