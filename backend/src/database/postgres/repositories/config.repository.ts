/**
 * Repositories PostgreSQL - configuracao (tarifas, limiares, turnos) e plantas
 * (sites/setores). Os valores de configuracao vivem em `tenant_config` (JSONB)
 * sob `(tenant_id, key)`; nao ha tabelas proprias para o contrato da
 * aplicacao (a tabela `tariffs` e o cadastro comercial, nao a tarifa de
 * calculo). Valores ausentes caem nos MESMOS defaults do adaptador memoria
 * (DEFAULT_TARIFF/DEFAULT_THRESHOLDS/seed.SHIFTS). As queries rodam com
 * `app.tenant_id` ja aplicado pelo pool (RLS).
 */

import { DEFAULT_THRESHOLDS } from "../../../analytics/anomaly.ts";
import { DEFAULT_TARIFF } from "../../../analytics/cost.ts";
import type {
  GatewayHealth,
  Plant,
  SectorMeta,
  Shift,
  Tariff,
  TariffSchedule,
  Thresholds,
} from "../../../domain/entities/index.ts";
import type { IConfigRepository, IPlantRepository } from "../../../domain/ports/index.ts";
import { clone } from "../../../shared/utils/index.ts";
import * as seed from "../../seeds/seed-data.ts";
import type { DatabasePort } from "../pool.ts";

const TARIFF_KEYS = [
  "offPeak", "intermediate", "peak", "contractedDemandKW", "excessDemandPenalty",
] as const;

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Le um valor JSONB de `tenant_config` do tenant corrente (objeto vazio se ausente). */
export async function readTenantJson(db: DatabasePort, key: string): Promise<Record<string, unknown>> {
  const { rows } = await db.query<{ value: unknown }>(
    `SELECT value FROM tenant_config WHERE tenant_id = app_current_tenant() AND key = $1`,
    [key],
  );
  return asObject(rows[0]?.value ?? null);
}

async function writeJson(db: DatabasePort, key: string, value: unknown): Promise<void> {
  await db.query(
    `INSERT INTO tenant_config (tenant_id, key, value) VALUES (app_current_tenant(), $1, $2::jsonb)
     ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

/** Reconstrói o cronograma de faixas (0-23h) salvo em JSON; `undefined` se invalido. */
function asSchedule(v: unknown): TariffSchedule | undefined {
  const o = asObject(v);
  const has = Array.isArray(o.offPeak) || Array.isArray(o.intermediate) || Array.isArray(o.peak);
  if (!has) return undefined;
  return {
    offPeak: Array.isArray(o.offPeak) ? (o.offPeak as number[][]) : [],
    intermediate: Array.isArray(o.intermediate) ? (o.intermediate as number[][]) : [],
    peak: Array.isArray(o.peak) ? (o.peak as number[][]) : [],
  };
}

/**
 * Saude dos gateways (cards do dashboard). Aceita o array seedado
 * `[{k, ok, v}]` ou o mapa legado `{k: v}`; sem valor, devolve o seed - mesmo
 * resultado do adaptador memoria (`state.gatewayHealth`).
 */
export async function readGatewayHealth(db: DatabasePort): Promise<GatewayHealth[]> {
  const { rows } = await db.query<{ value: unknown }>(
    `SELECT value FROM tenant_config WHERE tenant_id = app_current_tenant() AND key = 'gatewayHealth'`,
  );
  const raw = rows[0]?.value;
  if (Array.isArray(raw)) {
    return raw.map((entry) => {
      const o = asObject(entry);
      return {
        k: str(o.k),
        ok: o.ok === true || o.ok === "true",
        v: typeof o.v === "number" ? o.v : str(o.v),
      };
    });
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>).map(([k, v]) => ({
      k,
      ok: v === true || v === "true",
      v: typeof v === "number" ? v : str(v),
    }));
  }
  return clone(seed.GATEWAY_HEALTH);
}

export function createPostgresConfigRepository(db: DatabasePort): IConfigRepository {
  async function getTariff(): Promise<Tariff> {
    const stored = await readTenantJson(db, "tariff");
    const tariff: Tariff = clone(DEFAULT_TARIFF);
    for (const k of TARIFF_KEYS) {
      if (stored[k] !== undefined) tariff[k] = num(stored[k]);
    }
    tariff.schedule =
      asSchedule(stored.schedule) ??
      clone(DEFAULT_TARIFF.schedule ?? { offPeak: [], intermediate: [], peak: [] });
    return tariff;
  }

  async function setTariff(patch: Partial<Tariff>): Promise<Tariff> {
    const current = await getTariff();
    for (const k of TARIFF_KEYS) {
      const value = patch[k];
      if (value !== undefined) current[k] = num(value);
    }
    await writeJson(db, "tariff", current);
    return current;
  }

  async function getThresholds(): Promise<Thresholds> {
    const stored = await readTenantJson(db, "thresholds");
    const thresholds: Thresholds = clone(DEFAULT_THRESHOLDS);
    for (const k of Object.keys(thresholds) as (keyof Thresholds)[]) {
      if (stored[k] !== undefined) {
        (thresholds as unknown as Record<string, unknown>)[k] = num(stored[k]);
      }
    }
    if (stored.baselineTolerancePct !== undefined) {
      thresholds.baselineTolerancePct = num(stored.baselineTolerancePct);
    }
    return thresholds;
  }

  async function setThresholds(patch: Partial<Thresholds>): Promise<Thresholds> {
    const current = await getThresholds();
    for (const k of Object.keys(patch) as (keyof Thresholds)[]) {
      const value = patch[k];
      if (value !== undefined) {
        (current as unknown as Record<string, unknown>)[k] = num(value);
      }
    }
    await writeJson(db, "thresholds", current);
    return current;
  }

  async function listShifts(): Promise<Shift[]> {
    const { rows } = await db.query<{ value: unknown }>(
      `SELECT value FROM tenant_config WHERE tenant_id = app_current_tenant() AND key = 'shifts'`,
    );
    const raw = rows[0]?.value;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((entry) => {
        const o = asObject(entry);
        return {
          id: str(o.id),
          label: str(o.label),
          time: str(o.time),
          active: o.active === true || o.active === "true",
        };
      });
    }
    return clone(seed.SHIFTS);
  }

  async function toggleShift(id: string): Promise<Shift | null> {
    const shifts = await listShifts();
    const shift = shifts.find((s) => s.id === id);
    if (!shift) return null;
    shift.active = !shift.active;
    await writeJson(db, "shifts", shifts);
    return shift;
  }

  return {
    getTariff,
    setTariff,
    getThresholds,
    setThresholds,
    listShifts,
    toggleShift,
    async listGatewayHealth(): Promise<GatewayHealth[]> {
      return readGatewayHealth(db);
    },
  };
}

export function createPostgresPlantRepository(db: DatabasePort): IPlantRepository {
  return {
    async list(): Promise<Plant[]> {
      const { rows } = await db.query<{
        id: string;
        name: string;
        timezone: string;
        demand_limit_kw: number | null;
      }>(
        `SELECT id, name, timezone, demand_limit_kw FROM sites
         WHERE tenant_id = app_current_tenant() ORDER BY name, id`,
      );
      return rows.map((r) => ({
        id: str(r.id),
        name: str(r.name),
        timezone: str(r.timezone) || undefined,
        demandLimitKW:
          r.demand_limit_kw === null || r.demand_limit_kw === undefined
            ? 0
            : num(r.demand_limit_kw),
      }));
    },

    async listSectorMeta(): Promise<SectorMeta[]> {
      const { rows } = await db.query<{ sid: string; name: string; area_m2: number | null }>(
        `SELECT s.id AS sid, s.name, si.area_m2 FROM sectors s
         LEFT JOIN sites si ON si.id = s.site_id
         WHERE s.tenant_id = app_current_tenant() ORDER BY s.name, s.id`,
      );
      return rows.map((r) => ({
        id: str(r.sid),
        name: str(r.name),
        areaM2:
          r.area_m2 === null || r.area_m2 === undefined ? undefined : num(r.area_m2),
      }));
    },
  };
}
