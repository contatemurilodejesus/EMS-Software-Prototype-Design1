/**
 * Repositories PostgreSQL - alertas e intervencoes.
 *
 * O id de negocio visivel na API (ALT-2026-0041, INT-014) vive na coluna
 * `code`; a PK UUID continua sendo a referencia interna das FKs.
 */

import type { Alert, Intervention } from "../../../domain/entities/index.ts"
import type {
  AlertQuery,
  IAlertRepository,
  IInterventionRepository,
} from "../../../domain/ports/index.ts"
import type { DatabasePort } from "../pool.ts"
import { machineUuid } from "./machine.repository.ts"

type Row = Record<string, unknown>

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value)
}

function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asRecord(value: unknown): Record<string, string | number> {
  if (value && typeof value === "object") return value as Record<string, string | number>
  if (typeof value === "string") return { text: value }
  return {}
}

function toAlert(row: Row): Alert {
  return {
    id: str(row.code),
    machine: str(row.machine_label),
    machineId: str(row.machine_code),
    sector: str(row.sector),
    anomaly: str(row.anomaly),
    anomalyType: str(row.anomaly_type),
    condition: str(row.condition),
    peakTime: str(row.peak_time),
    severity: row.severity as Alert["severity"],
    status: row.status as Alert["status"],
    action: str(row.action),
    detectedAt: str(row.detected_at),
    auto: row.auto === true,
    ...(row.idle_cost ? { idleCost: str(row.idle_cost) } : {}),
    ...(row.acknowledged_at ? { acknowledgedAt: str(row.acknowledged_at) } : {}),
    ...(row.resolved_at ? { resolvedAt: str(row.resolved_at) } : {}),
    ...(row.assignee ? { assignee: str(row.assignee) } : {}),
    ...(row.estimated === true ? { estimated: true } : {}),
    ...(row.classification ? { classification: row.classification as Alert["classification"] } : {}),
    ...(row.avoidable_kwh !== null && row.avoidable_kwh !== undefined
      ? { avoidableKwh: num(row.avoidable_kwh) }
      : {}),
    ...(row.estimated_cost !== null && row.estimated_cost !== undefined
      ? { estimatedCost: num(row.estimated_cost) }
      : {}),
    ...(row.evidence && Object.keys(asRecord(row.evidence)).length
      ? { evidence: asRecord(row.evidence) }
      : {}),
  }
}

const ALERT_COLUMNS = `a.id, a.tenant_id, a.code, a.sector, a.anomaly, a.anomaly_type,
  a.condition, a.peak_time, a.severity, a.status, a.action, a.detected_at,
  a.auto, a.idle_cost, a.acknowledged_at, a.resolved_at, a.assignee,
  a.estimated, a.classification, a.avoidable_kwh, a.estimated_cost,
  a.evidence, a.machine_label, m.code AS machine_code`

export function createPostgresAlertRepository(db: DatabasePort): IAlertRepository {
  return {
    async list(query: AlertQuery = {}): Promise<Alert[]> {
      const conditions: string[] = []
      const values: unknown[] = []
      if (query.severity && query.severity !== "all") {
        values.push(query.severity)
        conditions.push(`a.severity = $${values.length}`)
      }
      if (query.status && query.status !== "all") {
        values.push(query.status)
        conditions.push(`a.status = $${values.length}`)
      }
      const { rows } = await db.query<Row>(
        `SELECT ${ALERT_COLUMNS}
           FROM alerts a
           LEFT JOIN machines m ON m.id = a.machine_id
          ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
          ORDER BY a.created_at DESC`,
        values,
      )
      return rows.map(toAlert)
    },

    async findById(id: string): Promise<Alert | null> {
      const { rows } = await db.query<Row>(
        `SELECT ${ALERT_COLUMNS}
           FROM alerts a
           LEFT JOIN machines m ON m.id = a.machine_id
          WHERE a.code = $1`,
        [id],
      )
      return rows[0] ? toAlert(rows[0]) : null
    },

    async countOpen(): Promise<number> {
      const { rows } = await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM alerts WHERE status <> 'resolved'",
      )
      return rows[0]?.n ?? 0
    },

    async save(alert: Alert): Promise<Alert> {
      const uuid = await machineUuid(db, alert.machineId)
      await db.query<Row>(
        `INSERT INTO alerts
           (tenant_id, code, machine_id, machine_label, sector, anomaly,
            anomaly_type, condition, peak_time, severity, status, action,
            message, detected_at, auto, idle_cost, acknowledged_at,
            resolved_at, assignee, estimated, classification,
            avoidable_kwh, estimated_cost, evidence)
         VALUES
           (app_current_tenant(), $1, $2::uuid, $3, $4, $5,
            $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16,
            $17, $18, $19, $20,
            $21, $22, $23::jsonb)
         RETURNING *`,
        [
          alert.id,
          uuid,
          alert.machine,
          alert.sector,
          alert.anomaly,
          alert.anomalyType,
          alert.condition,
          alert.peakTime || null,
          alert.severity,
          alert.status,
          alert.action || null,
          alert.anomaly,
          alert.detectedAt || null,
          alert.auto === true,
          alert.idleCost ?? null,
          alert.acknowledgedAt ?? null,
          alert.resolvedAt ?? null,
          alert.assignee ?? null,
          alert.estimated === true,
          alert.classification ?? null,
          alert.avoidableKwh ?? null,
          alert.estimatedCost ?? null,
          JSON.stringify(alert.evidence ?? {}),
        ],
      )
      return (await this.findById(alert.id)) ?? alert
    },

    async update(id: string, patch: Partial<Alert>): Promise<Alert | null> {
      const assignments: string[] = []
      const values: unknown[] = []
      const set = (column: string, value: unknown): void => {
        values.push(value)
        assignments.push(`${column} = $${values.length}`)
      }

      if (patch.machine !== undefined) set("machine_label", patch.machine)
      if (patch.sector !== undefined) set("sector", patch.sector)
      if (patch.anomaly !== undefined) set("anomaly", patch.anomaly)
      if (patch.anomalyType !== undefined) set("anomaly_type", patch.anomalyType)
      if (patch.condition !== undefined) set("condition", patch.condition)
      if (patch.peakTime !== undefined) set("peak_time", patch.peakTime)
      if (patch.severity !== undefined) set("severity", patch.severity)
      if (patch.status !== undefined) set("status", patch.status)
      if (patch.action !== undefined) set("action", patch.action)
      if (patch.detectedAt !== undefined) set("detected_at", patch.detectedAt)
      if (patch.auto !== undefined) set("auto", patch.auto)
      if (patch.idleCost !== undefined) set("idle_cost", patch.idleCost)
      if (patch.acknowledgedAt !== undefined) set("acknowledged_at", patch.acknowledgedAt)
      if (patch.resolvedAt !== undefined) set("resolved_at", patch.resolvedAt)
      if (patch.assignee !== undefined) set("assignee", patch.assignee)
      if (patch.estimated !== undefined) set("estimated", patch.estimated)
      if (patch.classification !== undefined) set("classification", patch.classification)
      if (patch.avoidableKwh !== undefined) set("avoidable_kwh", patch.avoidableKwh)
      if (patch.estimatedCost !== undefined) set("estimated_cost", patch.estimatedCost)
      if (patch.evidence !== undefined) set("evidence", JSON.stringify(patch.evidence))
      if (patch.machineId !== undefined) {
        const uuid = await machineUuid(db, patch.machineId)
        if (uuid) set("machine_id", uuid)
      }
      if (!assignments.length) return this.findById(id)

      values.push(id)
      const { rowCount } = await db.query(
        `UPDATE alerts SET ${assignments.join(", ")} WHERE code = $${values.length}`,
        values,
      )
      if (!rowCount) return null
      return this.findById(id)
    },
  }
}

function toIntervention(row: Row): Intervention {
  const base: Intervention = {
    id: str(row.code),
    date: str(row.date_label),
    machine: str(row.machine_label),
    desc: str(row.description),
    before: num(row.before_value),
    after: num(row.after_value),
    saved: num(row.saved_value),
    period: str(row.period),
    confidence: str(row.confidence),
    status: row.status as Intervention["status"],
  }
  if (row.machine_code) base.machineId = str(row.machine_code)
  if (row.simulated === true) base.simulated = true
  if (row.estimated === true) base.estimated = true
  if (row.saved_kwh_day !== null && row.saved_kwh_day !== undefined)
    base.savedKwhDay = num(row.saved_kwh_day)
  if (row.saved_brl_day !== null && row.saved_brl_day !== undefined)
    base.savedBrlDay = num(row.saved_brl_day)
  return base
}

export function createPostgresInterventionRepository(db: DatabasePort): IInterventionRepository {
  return {
    async list(): Promise<Intervention[]> {
      const { rows } = await db.query<Row>(
        `SELECT code, date_label, machine_label, machine_code, description,
                before_value, after_value, saved_value, period, confidence,
                status, simulated, estimated, saved_kwh_day, saved_brl_day
           FROM interventions
          ORDER BY created_at DESC`,
      )
      return rows.map(toIntervention)
    },

    async save(intervention: Intervention): Promise<Intervention> {
      const machineCode = intervention.machineId ?? intervention.machine
      const uuid = machineCode ? await machineUuid(db, machineCode) : null
      const { rows } = await db.query<Row>(
        `INSERT INTO interventions
           (tenant_id, code, date_label, machine_label, machine_code, machine_id,
            description, before_value, after_value, saved_value, period,
            confidence, status, simulated, estimated, saved_kwh_day, saved_brl_day)
         VALUES
           (app_current_tenant(), $1, $2, $3, $4, $5::uuid,
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16)
         RETURNING code`,
        [
          intervention.id, intervention.date, intervention.machine, machineCode,
          uuid, intervention.desc, intervention.before, intervention.after,
          intervention.saved, intervention.period, intervention.confidence,
          intervention.status, intervention.simulated === true,
          intervention.estimated !== false,
          intervention.savedKwhDay ?? null, intervention.savedBrlDay ?? null,
        ],
      )
      const saved = await db.query<Row>(
        `SELECT code, date_label, machine_label, machine_code, description,
                before_value, after_value, saved_value, period, confidence,
                status, simulated, estimated, saved_kwh_day, saved_brl_day
           FROM interventions WHERE code = $1`,
        [rows[0]?.code ?? intervention.id],
      )
      return toIntervention(saved.rows[0] ?? {})
    },
  }
}
