/**
 * Repository PostgreSQL - modulo protocolar. `protocols.id` e o id de negocio
 * (`EMS-AAAA-NNNN`) e `tenant_id` e aplicado via `app.tenant_id` (RLS). `evidence`
 * e `events` sao JSONB.
 */

import type { Protocol, ProtocolEvent } from "../../../domain/entities/index.ts";
import type { IProtocolRepository, ProtocolQuery } from "../../../domain/ports/index.ts";
import type { ProtocolPriority, ProtocolStatus } from "../../../domain/value-objects/index.ts";
import type { DatabasePort } from "../pool.ts";

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/**
 * Reconstrói o protocolo da linha `protocols`. `sla*`/`hoursToDeadline` NAO
 * existem como coluna: sao derivados pelo `protocol.service.decorate()`, que e
 * chamado em todo caminho de leitura (mesmo comportamento do adaptador memoria).
 */
function toProtocol(row: Record<string, unknown>): Protocol {
  return {
    id: str(row.id), title: str(row.title), machineId: str(row.machine_code), machine: str(row.machine),
    sector: str(row.sector), origin: str(row.origin),
    priority: str(row.priority) as ProtocolPriority,
    status: str(row.status) as ProtocolStatus,
    alertId: row.alert_id !== null && row.alert_id !== undefined ? str(row.alert_id) : null,
    assignee: str(row.assignee), description: str(row.description), openedAt: str(row.opened_at),
    deadline: row.deadline !== null && row.deadline !== undefined ? str(row.deadline) : undefined,
    closedAt: row.closed_at !== null && row.closed_at !== undefined ? str(row.closed_at) : null,
    evidence: Array.isArray(row.evidence) ? (row.evidence as string[]) : [],
    events: Array.isArray(row.events) ? (row.events as ProtocolEvent[]) : [],
  };
}

export function createPostgresProtocolRepository(db: DatabasePort): IProtocolRepository {
  async function listSQL(query: ProtocolQuery = {}): Promise<Protocol[]> {
    const cond: string[] = ["tenant_id = app_current_tenant()"];
    const vals: unknown[] = [];
    if (query.status && query.status !== "all") { vals.push(query.status); cond.push(`status = $${vals.length}`); }
    if (query.priority && query.priority !== "all") { vals.push(query.priority); cond.push(`priority = $${vals.length}`); }
    let sql = `SELECT * FROM protocols WHERE ${cond.join(" AND ")} ORDER BY created_at DESC`;
    const params = vals.slice();
    if (query.limit && query.limit > 0) { params.push(query.limit); sql += ` LIMIT $${params.length}`; }
    const { rows } = await db.query<Record<string, unknown>>(sql, params);
    return rows.map(toProtocol);
  }

  return {
    async list(query: ProtocolQuery = {}): Promise<Protocol[]> { return listSQL(query); },

    async findById(id: string): Promise<Protocol | null> {
      const { rows } = await db.query<Record<string, unknown>>(
        `SELECT * FROM protocols WHERE tenant_id = app_current_tenant() AND id = $1`, [id],
      );
      return rows[0] ? toProtocol(rows[0]) : null;
    },

    async nextSequence(year: number): Promise<number> {
      const { rows } = await db.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM protocols WHERE tenant_id = app_current_tenant() AND id LIKE 'EMS-' || $1 || '%'`,
        [String(year)],
      );
      return rows[0]?.n ?? 0;
    },

    async save(protocol: Protocol): Promise<Protocol> {
      await db.query(
        `INSERT INTO protocols (id, tenant_id, title, machine_code, machine, sector, origin, priority, status,
            alert_id, assignee, description, opened_at, deadline, closed_at, evidence, events, created_at, updated_at)
         VALUES ($1, app_current_tenant(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, now(), now())`,
        [protocol.id, protocol.title, protocol.machineId, protocol.machine, protocol.sector, protocol.origin,
          protocol.priority, protocol.status, protocol.alertId, protocol.assignee, protocol.description,
          protocol.openedAt, protocol.deadline ?? null, protocol.closedAt ?? null,
          JSON.stringify(protocol.evidence), JSON.stringify(protocol.events)],
      );
      const saved = await this.findById(protocol.id);
      if (!saved) {
        throw new Error(`Protocolo ${protocol.id} indisponivel apos gravacao`);
      }
      return saved;
    },

    async update(id: string, patch: Partial<Protocol>): Promise<Protocol | null> {
      const current = await this.findById(id);
      if (!current) return null;
      const next = { ...current, ...patch } as Protocol;
      const { rows } = await db.query<Record<string, unknown>>(
        `UPDATE protocols SET title = $2, machine_code = $3, machine = $4, sector = $5, origin = $6, priority = $7,
            status = $8, alert_id = $9, assignee = $10, description = $11, opened_at = $12, deadline = $13,
            closed_at = $14, evidence = $15::jsonb, events = $16::jsonb, updated_at = now()
         WHERE tenant_id = app_current_tenant() AND id = $1 RETURNING *`,
        [id, next.title, next.machineId, next.machine, next.sector, next.origin, next.priority, next.status,
          next.alertId, next.assignee, next.description, next.openedAt, next.deadline ?? null,
          next.closedAt ?? null, JSON.stringify(next.evidence), JSON.stringify(next.events)],
      );
      return rows[0] ? toProtocol(rows[0]) : null;
    },

    async appendEvent(id: string, event: ProtocolEvent): Promise<Protocol | null> {
      const current = await this.findById(id);
      if (!current) return null;
      const next = { ...current, events: [...current.events, event] };
      await db.query(
        `UPDATE protocols SET events = $2::jsonb, updated_at = now() WHERE tenant_id = app_current_tenant() AND id = $1`,
        [id, JSON.stringify(next.events)],
      );
      return this.findById(id);
    },
  };
}
