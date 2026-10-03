/**
 * Schemas de validacao (zod) - separados da logica de negocio (secao 8).
 * Toda entrada externa (body/query/params) passa por aqui.
 */

import { z } from "zod"

const numeric = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)])

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
})

export const machineQuerySchema = z
  .object({
    state: z.string().optional(),
    sector: z.string().optional(),
  })
  .merge(paginationSchema)

export const machineCreateSchema = z.object({
  id: z.string().min(1, "id é obrigatório"),
  name: z.string().optional(),
  type: z.string().optional(),
  sector: z.string().optional(),
  gateway: z.string().optional(),
  nominalKW: numeric.optional(),
  pOff: numeric.optional(),
  pRun: numeric.optional(),
  power: numeric.optional(),
  consumption: numeric.optional(),
  temperature: numeric.optional(),
  powerFactor: numeric.optional(),
  voltage: numeric.optional(),
  current: numeric.optional(),
  coverage: numeric.optional(),
})

export const machineUpdateSchema = machineCreateSchema.partial().omit({ id: true })

export const alertsQuerySchema = z
  .object({
    severity: z.string().optional(),
    status: z.string().optional(),
  })
  .merge(paginationSchema)

export const alertAdvanceSchema = z
  .object({ assignee: z.string().optional() })
  .partial()
  .default({})

export const interventionsQuerySchema = paginationSchema

export const scenarioSchema = z.object({
  scenario: z.string().optional(),
  scenarioId: z.string().optional(),
})

/** O demo aceita corpos livres (compatibilidade com o prototipo). */
export const freeBodySchema = z.record(z.string(), z.unknown()).default({})

export const protocolQuerySchema = z
  .object({
    status: z.string().optional(),
    priority: z.string().optional(),
    sla: z.string().optional(),
  })
  .merge(paginationSchema)

export const protocolCreateSchema = z.object({
  title: z.string().optional(),
  machineId: z.string().optional(),
  machine: z.string().optional(),
  sector: z.string().optional(),
  origin: z.string().optional(),
  priority: z.string().optional(),
  alertId: z.string().optional(),
  assignee: z.string().optional(),
  description: z.string().optional(),
  evidence: z.array(z.string()).optional(),
  actor: z.string().optional(),
  note: z.string().optional(),
})

export const protocolAdvanceSchema = z.object({
  status: z.string().optional(),
  actor: z.string().optional(),
  note: z.string().optional(),
})

export const protocolEventSchema = z.object({
  type: z.string().optional(),
  actor: z.string().optional(),
  note: z.string().optional(),
})

export const economyQuerySchema = paginationSchema

export const configPatchSchema = z.record(z.string(), z.unknown())

export const telemetryQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().positive().max(5000).optional(),
})

export const emptySchema = z.object({}).partial().default({})