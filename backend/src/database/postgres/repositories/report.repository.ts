/**
 * Repository PostgreSQL - read models de relatorios/dashboard (agregacoes SQL).
 * `tenant_config` fica nos demais; este e puro SQL sobre as tabelas.
 */

import type { AuditLog, ConsumptionPoint, Gateway, GatewayHealth, ReadingsCounters } from "../../../domain/entities/index.ts";
import type { IAuditLogRepository, IReportRepository, JsonRow } from "../../../domain/ports/index.ts";
import type { DatabasePort } from "../pool.ts";

function series(db: DatabasePort, sql: string): Promise<ConsumptionPoint[]> {
  return db.query<{ time: string; valor: number }>(sql).then((r) =>
    r.rows.map((row) => ({ time: row.time, consumo: Number(row.valor) })),
  );
}

export function createPostgresReportRepository(db: DatabasePort): IReportRepository {
  const tenant = `app_current_tenant()`;
  const now7 = "now() - interval '7 days'";

  const hourly = () => series(db, `SELECT date_trunc('hour', ts)::text AS time, sum(power_kw) AS valor FROM telemetry
                     WHERE tenant_id = ${tenant} AND ts >= ${now7} GROUP BY 1 ORDER BY 1`);

  return {
    async readings(): Promise<ReadingsCounters> {
      const counts = await db.query<{ quality: string; n: number }>(
        `SELECT quality, count(*)::int AS n FROM telemetry WHERE tenant_id = ${tenant} GROUP BY quality`,
      );
      const c: ReadingsCounters = { good: 0, missing: 0, outlier: 0, duplicate: 0 };
      for (const r of counts.rows) { const k = (r.quality ?? "").toLowerCase(); if (k in c) c[k as keyof ReadingsCounters] = r.n; }
      return c;
    },

    async consumptionSeries(): Promise<ConsumptionPoint[]> {
      return hourly();
    },

    async shiftSeries(): Promise<JsonRow[]> {
      return hourly() as unknown as JsonRow[];
    },

    async costTrend(): Promise<JsonRow[]> {
      return series(db, `SELECT date_trunc('hour', ts)::text AS time, sum(power_kw) * 2.1 AS valor FROM telemetry
                     WHERE tenant_id = ${tenant} AND ts >= ${now7} GROUP BY 1 ORDER BY 1`) as unknown as JsonRow[];
    },

    async machineBreakdown(): Promise<JsonRow[]> {
      const { rows } = await db.query<{ state: string; n: number }>(
        `SELECT ms.state AS state, count(*)::int AS n FROM machine_states ms
         JOIN machines m ON m.id = ms.machine_id
         WHERE m.tenant_id = ${tenant} AND ms.ended_at IS NULL GROUP BY 1 ORDER BY n DESC`,
      );
      return rows.map((r) => ({ state: r.state, quantidade: Number(r.n) }));
    },

    async tariffProfile(): Promise<JsonRow[]> {
      const { rows } = await db.query<{ name: string; price: number }>(
        `SELECT name, price_per_kwh AS price FROM tariffs WHERE tenant_id = ${tenant} AND active ORDER BY id DESC LIMIT 1`,
      );
      return rows.map((r) => ({ name: r.name, price: Number(r.price) }));
    },

    async opportunities(): Promise<JsonRow[]> {
      const { rows } = await db.query<{ desc: string; custo: number }>(
        `SELECT 'IDLE ' || m.code AS desc, sum(ms.duration_minutes)::numeric * 0.12 AS custo FROM machine_states ms
         JOIN machines m ON m.id = ms.machine_id
         WHERE m.tenant_id = ${tenant} AND ms.state = 'IDLE' AND ms.ended_at IS NULL GROUP BY m.code ORDER BY custo DESC LIMIT 5`,
      );
      return rows.map((r) => ({ desc: r.desc, custo: Number(r.custo) }));
    },

    async gateways(): Promise<Gateway[]> {
      const { rows } = await db.query<{ id: string; label: string; status: string; sub: string }>(
        `SELECT id, label, status, sub FROM gateways WHERE tenant_id = ${tenant} ORDER BY name`,
      );
      return rows.map((r) => ({ id: r.id, label: r.label, status: r.status, sub: r.sub }));
    },

    async gatewayHealth(): Promise<GatewayHealth[]> {
      const { rows } = await db.query<{ k: string; ok: boolean; v: string | number }>(
        `SELECT k, ok, v FROM gateway_health WHERE tenant_id = ${tenant} ORDER BY k`,
      );
      return rows.map((r) => ({ k: r.k, ok: r.ok, v: r.v }));
    },

    async nonMonitoredKwhDay(): Promise<number> {
      const { rows } = await db.query<{ n: number }>(
        `SELECT coalesce(sum(power_kw),0)::int AS n FROM telemetry
         WHERE tenant_id = ${tenant} AND ts >= ${now7}`,
      );
      return rows[0]?.n ?? 0;
    },
  };
}

/** Repositorio PostgreSQL - audit log (nenhum dado sensivel; listagem cruzada por papel). */

export function createPostgresAuditLogRepository(db: DatabasePort): IAuditLogRepository {
  return {
    async list(tenantId: string | null, limit = 200): Promise<AuditLog[]> {
      const cond: string[] = [];
      const vals: unknown[] = [];
      if (tenantId) { cond.push(`tenant_id = $${vals.length + 1}`); vals.push(tenantId); }
      const sql = `SELECT id, tenant_id, user_id, action, resource, resource_id, result, metadata, ip, user_agent, created_at
                   FROM audit_logs `;
      const sqlWhere = cond.length ? `${sql}WHERE ${cond.join(" AND ")} ORDER BY created_at DESC LIMIT $${vals.length + 1}`
        : `${sql}ORDER BY created_at DESC LIMIT $${vals.length + 1}`;
      const { rows } = await db.query<AuditLogRow>(sqlWhere, vals.concat(limit));
      return rows.map((r) => ({
        id: r.id,
        tenantId: r.tenant_id,
        userId: r.user_id,
        action: r.action,
        resource: r.resource,
        resourceId: r.resource_id,
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
        ip: r.ip ?? undefined,
        userAgent: r.user_agent ?? undefined,
        createdAt: r.created_at,
      }));
    },

    async append(entry: AuditLog): Promise<AuditLog> {
      await db.query(
        `INSERT INTO audit_logs (id, tenant_id, user_id, action, resource, resource_id, result, metadata, ip, user_agent, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'success', $7::jsonb, $8, $9, $10::timestamptz)`,
        [entry.id, entry.tenantId, entry.userId, entry.action, entry.resource, entry.resourceId ?? null,
          entry.metadata ?? {}, entry.ip ?? null, entry.userAgent ?? null, entry.createdAt],
      );
      return entry;
    },
  };
}

type AuditLogRow = {
  id: string; tenant_id: string | null; user_id: string | null; action: string; resource: string;
  resource_id: string | null; result: string; metadata: unknown; ip: string | null; user_agent: string | null;
  created_at: string;
};
