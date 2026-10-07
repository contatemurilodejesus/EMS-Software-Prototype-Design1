/**
 * Repositories PostgreSQL - eventos de maquina, relacoes e analise de impacto.
 */

import type { ImpactAnalysis, MachineEvent, MachineRelationship } from "../../../domain/entities/index.ts"
import type { RelationshipType } from "../../../domain/value-objects/index.ts"
import type {
  IImpactAnalysisRepository,
  IMachineEventRepository,
  ImpactAnalysisQuery,
  IRelationshipRepository,
  MachineEventQuery,
} from "../../../domain/ports/index.ts"
import type { DatabasePort } from "../pool.ts"
import { machineUuid } from "./machine.repository.ts"

type Row = Record<string, unknown>

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

const MACHINE_CODE_JOIN = "LEFT JOIN machines m ON m.id = e.machine_id"

function toEvent(row: Row): MachineEvent {
  return {
    id: str(row.code),
    tenantId: str(row.tenant_id),
    machineId: str(row.machine_code),
    type: row.type as MachineEvent["type"],
    severity: row.severity as MachineEvent["severity"],
    timestamp: new Date(str(row.timestamp)).toISOString(),
    metadata: asRecord(row.metadata),
    createdAt: str(row.created_at),
  }
}

export function createPostgresMachineEventRepository(db: DatabasePort): IMachineEventRepository {
  return {
    async list(tenantId: string, query: MachineEventQuery = {}): Promise<MachineEvent[]> {
      const conditions: string[] = ["e.tenant_id = $1"]
      const values: unknown[] = [tenantId]
      if (query.machineId) {
        values.push(query.machineId)
        conditions.push(`m.code = $${values.length}`)
      }
      if (query.type) {
        values.push(query.type)
        conditions.push(`e.type = $${values.length}`)
      }
      if (query.severity) {
        values.push(query.severity)
        conditions.push(`e.severity = $${values.length}`)
      }
      let sql = `SELECT e.id, e.tenant_id, e.type, e.severity, e.timestamp,
                        e.metadata, e.code, e.created_at, m.code AS machine_code
                   FROM machine_events e ${MACHINE_CODE_JOIN}
                  WHERE ${conditions.join(" AND ")}
                  ORDER BY e.timestamp DESC`
      if (query.limit && query.limit > 0) {
        values.push(query.limit)
        sql += ` LIMIT $${values.length}`
      }
      const { rows } = await db.query<Row>(sql, values)
      return rows.map(toEvent)
    },

    async findById(id: string, tenantId: string): Promise<MachineEvent | null> {
      const { rows } = await db.query<Row>(
        `SELECT e.id, e.tenant_id, e.type, e.severity, e.timestamp,
                e.metadata, e.code, e.created_at, m.code AS machine_code
           FROM machine_events e ${MACHINE_CODE_JOIN}
          WHERE e.code = $1 AND e.tenant_id = $2`,
        [id, tenantId],
      )
      return rows[0] ? toEvent(rows[0]) : null
    },

    async save(event: MachineEvent): Promise<MachineEvent> {
      const uuid = await machineUuid(db, event.machineId)
      await db.query(
        `INSERT INTO machine_events
           (tenant_id, code, machine_id, type, severity, timestamp, metadata)
         VALUES ($1, $2, $3::uuid, $4, $5, $6, $7::jsonb)`,
        [
          event.tenantId, event.id, uuid, event.type, event.severity,
          event.timestamp, JSON.stringify(event.metadata ?? {}),
        ],
      )
      return event
    },
  }
}

function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toRelationship(row: Row): MachineRelationship {
  return {
    id: str(row.code),
    tenantId: str(row.tenant_id),
    sourceMachineId: str(row.source_code),
    targetMachineId: str(row.target_code),
    relationshipType: row.relationship_type as MachineRelationship["relationshipType"],
    dependencyLevel: Math.min(3, Math.max(1, num(row.dependency_level))) as 1 | 2 | 3,
    active: row.active !== false,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  }
}

const REL_COLUMNS = `r.id, r.tenant_id, r.code, r.relationship_type,
  r.dependency_level, r.active, r.created_at, r.updated_at,
  s.code AS source_code, t.code AS target_code`
const REL_JOIN = `machine_relationships r
  LEFT JOIN machines s ON s.id = r.source_machine_id
  LEFT JOIN machines t ON t.id = r.target_machine_id`

export function createPostgresRelationshipRepository(db: DatabasePort): IRelationshipRepository {
  return {
    async list(tenantId: string): Promise<MachineRelationship[]> {
      const { rows } = await db.query<Row>(
        `SELECT ${REL_COLUMNS} FROM ${REL_JOIN} WHERE r.tenant_id = $1 ORDER BY r.created_at ASC`,
        [tenantId],
      )
      return rows.map(toRelationship)
    },

    async findById(id: string, tenantId: string): Promise<MachineRelationship | null> {
      const { rows } = await db.query<Row>(
        `SELECT ${REL_COLUMNS} FROM ${REL_JOIN} WHERE r.code = $1 AND r.tenant_id = $2`,
        [id, tenantId],
      )
      return rows[0] ? toRelationship(rows[0]) : null
    },

    async findUnique(
      tenantId: string,
      sourceMachineId: string,
      targetMachineId: string,
      relationshipType: RelationshipType,
    ): Promise<MachineRelationship | null> {
      const { rows } = await db.query<Row>(
        `SELECT ${REL_COLUMNS} FROM ${REL_JOIN}
          WHERE r.tenant_id = $1 AND s.code = $2 AND t.code = $3
            AND r.relationship_type = $4`,
        [tenantId, sourceMachineId, targetMachineId, relationshipType],
      )
      return rows[0] ? toRelationship(rows[0]) : null
    },

    async save(rel: MachineRelationship): Promise<MachineRelationship> {
      const source = await machineUuid(db, rel.sourceMachineId)
      const target = await machineUuid(db, rel.targetMachineId)
      const { rows } = await db.query<Row>(
        `INSERT INTO machine_relationships
           (tenant_id, code, source_machine_id, target_machine_id,
            relationship_type, dependency_level, active)
         VALUES ($1, $2, $3::uuid, $4::uuid, $5, $6, $7)
         RETURNING code`,
        [
          rel.tenantId, rel.id, source, target,
          rel.relationshipType, rel.dependencyLevel, rel.active,
        ],
      )
      const saved = await this.findById(str(rows[0]?.code ?? rel.id), rel.tenantId)
      return saved ?? rel
    },

    async update(
      id: string,
      tenantId: string,
      patch: Partial<MachineRelationship>,
    ): Promise<MachineRelationship | null> {
      const assignments: string[] = []
      const values: unknown[] = []
      const set = (column: string, value: unknown): void => {
        values.push(value)
        assignments.push(`${column} = $${values.length}`)
      }
      if (patch.relationshipType !== undefined) set("relationship_type", patch.relationshipType)
      if (patch.dependencyLevel !== undefined) set("dependency_level", patch.dependencyLevel)
      if (patch.active !== undefined) set("active", patch.active)
      if (!assignments.length) return this.findById(id, tenantId)
      values.push(id, tenantId)
      const { rowCount } = await db.query(
        `UPDATE machine_relationships SET ${assignments.join(", ")}
          WHERE code = $${values.length - 1} AND tenant_id = $${values.length}`,
        values,
      )
      if (!rowCount) return null
      return this.findById(id, tenantId)
    },

    async remove(id: string, tenantId: string): Promise<boolean> {
      const { rowCount } = await db.query(
        "DELETE FROM machine_relationships WHERE code = $1 AND tenant_id = $2",
        [id, tenantId],
      )
      return (rowCount ?? 0) > 0
    },
  }
}
function toImpact(row: Row): ImpactAnalysis {
  return {
    id: str(row.code),
    tenantId: str(row.tenant_id),
    triggerEventId: row.trigger_event_code ? str(row.trigger_event_code) : null,
    machineId: str(row.machine_code),
    windowStart: new Date(str(row.window_start)).toISOString(),
    windowEnd: new Date(str(row.window_end)).toISOString(),
    avoidableKwh: num(row.avoidable_kwh),
    estimatedCost: num(row.estimated_cost),
    classification: row.classification as ImpactAnalysis["classification"],
    evidence: (row.evidence && typeof row.evidence === "object"
      ? (row.evidence as Record<string, unknown>)
      : {}) as ImpactAnalysis["evidence"],
    alertId: row.alert_code ? str(row.alert_code) : null,
    createdAt: str(row.created_at),
  }
}

const IMPACT_COLUMNS = `i.id, i.tenant_id, i.code, i.trigger_event_code,
  i.window_start, i.window_end, i.avoidable_kwh, i.estimated_cost,
  i.classification, i.evidence, i.created_at,
  m.code AS machine_code, a.code AS alert_code`
const IMPACT_JOIN = `impact_analyses i
  LEFT JOIN machines m ON m.id = i.machine_id
  LEFT JOIN alerts a ON a.id = i.alert_id`

export function createPostgresImpactAnalysisRepository(
  db: DatabasePort,
): IImpactAnalysisRepository {
  return {
    async list(tenantId: string, query: ImpactAnalysisQuery = {}): Promise<ImpactAnalysis[]> {
      const conditions = ["i.tenant_id = $1"]
      const values: unknown[] = [tenantId]
      if (query.machineId) {
        values.push(query.machineId)
        conditions.push(`m.code = $${values.length}`)
      }
      let sql = `SELECT ${IMPACT_COLUMNS} FROM ${IMPACT_JOIN}
                  WHERE ${conditions.join(" AND ")}
                  ORDER BY i.created_at DESC`
      if (query.limit && query.limit > 0) {
        values.push(query.limit)
        sql += ` LIMIT $${values.length}`
      }
      const { rows } = await db.query<Row>(sql, values)
      return rows.map(toImpact)
    },

    async findById(id: string, tenantId: string): Promise<ImpactAnalysis | null> {
      const { rows } = await db.query<Row>(
        `SELECT ${IMPACT_COLUMNS} FROM ${IMPACT_JOIN}
          WHERE i.code = $1 AND i.tenant_id = $2`,
        [id, tenantId],
      )
      return rows[0] ? toImpact(rows[0]) : null
    },

    async save(analysis: ImpactAnalysis): Promise<ImpactAnalysis> {
      const machine = await machineUuid(db, analysis.machineId)
      const { rows } = await db.query<Row>(
        `INSERT INTO impact_analyses
           (tenant_id, code, machine_id, window_start, window_end,
            avoidable_kwh, estimated_cost, classification, evidence,
            trigger_event_code, created_at)
         VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
         RETURNING code`,
        [
          analysis.tenantId, analysis.id, machine,
          analysis.windowStart, analysis.windowEnd,
          analysis.avoidableKwh, analysis.estimatedCost, analysis.classification,
          JSON.stringify(analysis.evidence ?? {}), analysis.triggerEventId,
          analysis.createdAt,
        ],
      )
      const saved = await this.findById(str(rows[0]?.code ?? analysis.id), analysis.tenantId)
      return saved ?? analysis
    },
  }
}

