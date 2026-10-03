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

/* ---------------- Autenticacao (secao 7) ---------------- */

export const loginSchema = z.object({
  email: z.string().min(3, "e-mail é obrigatório"),
  password: z.string().min(1, "senha é obrigatória"),
})

export const refreshSchema = z.object({
  refreshToken: z.string().min(10, "refresh token é obrigatório"),
})

export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
})

export const inviteCreateSchema = z.object({
  email: z.string().min(3, "e-mail do convidado é obrigatório"),
  name: z.string().optional(),
  role: z.enum(["ADMIN", "ACCOUNTING", "MACHINE_EVALUATOR"]).default("MACHINE_EVALUATOR"),
})

export const inviteAcceptSchema = z.object({
  code: z.string().min(8, "código de convite é obrigatório"),
  name: z.string().min(2, "nome é obrigatório"),
  email: z.string().optional(),
  password: z.string().min(8, "a senha deve ter ao menos 8 caracteres"),
})

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "informe a senha atual"),
  newPassword: z.string().min(8, "a nova senha deve ter ao menos 8 caracteres"),
})

/* ---------------- Relacoes, eventos e impacto (secao 11) ---------------- */

export const relationshipCreateSchema = z.object({
  sourceMachineId: z.string().min(1, "sourceMachineId é obrigatório"),
  targetMachineId: z.string().min(1, "targetMachineId é obrigatório"),
  relationshipType: z
    .enum(["SUPPLIES", "FEEDS", "DEPENDS_ON", "FOLLOWS", "COUPLED", "PARALLEL", "BACKUP"])
    .default("SUPPLIES"),
  dependencyLevel: z.coerce.number().int().min(1).max(3).optional(),
  active: z.boolean().optional(),
})

export const relationshipUpdateSchema = relationshipCreateSchema.partial().omit({
  sourceMachineId: true,
  targetMachineId: true,
})

export const eventQuerySchema = z
  .object({
    machineId: z.string().optional(),
    type: z.string().optional(),
    severity: z.string().optional(),
    limit: z.coerce.number().int().positive().max(500).optional(),
  })

export const impactQuerySchema = z.object({
  machineId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
})

export const impactAnalyzeSchema = z.object({
  machineId: z.string().min(1, "machineId é obrigatório"),
  windowStart: z.string().optional(),
  windowEnd: z.string().optional(),
  downstreamPowerKw: z.record(z.string(), z.coerce.number()).optional(),
})