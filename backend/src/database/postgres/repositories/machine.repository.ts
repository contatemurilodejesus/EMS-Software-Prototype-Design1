/**
 * Repositories PostgreSQL - maquinas, telemetria e estados derivados.
 *
 * MAPEAMENTO DE IDENTIDADE: a API expoe o `code` da maquina como `id`
 * (ex.: "INJ-01"); o banco usa PK UUID interna e as FKs guardam o UUID.
 *   - escrita: resolve code -> uuid via subquery (escopada pela RLS);
 *   - leitura: JOIN machines devolve o `code` como machine_id.
 *
 * Toda consulta roda com o tenant da requisicao aplicado na MESMA conexao
 * (ver pool.ts) - a RLS e a clausula WHERE filtram em duas camadas.
 */

import type { MachineRecord, ReadingsCounters, TelemetryReading } from "../../../domain/entities/index.ts"
import type { DataQuality, MachineState } from "../../../domain/value-objects/index.ts"
import type {
  IMachineRepository,
  IMachineStateRepository,
  ITelemetryRepository,
  MachineQuery,
  MachineStateInterval,
  TelemetryQuery,
} from "../../../domain/ports/index.ts"
import type { DatabasePort } from "../pool.ts"

type Row = Record<string, unknown>

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value)
}

function isoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function toMachineRecord(row: Row): MachineRecord {
  return {
    id: str(row.code),
    tenantId: str(row.tenant_id),
    name: str(row.name),
    type: str(row.type),
    sector: str(row.sector),
    gateway: str(row.gateway),
    nominalKW: num(row.nominal_power_kw),
    pOff: num(row.p_off_kw),
    pRun: num(row.p_run_kw),
    voltage: num(row.voltage),
    current: num(row.current),
    power: num(row.power),
    consumption: num(row.consumption),
    temperature: num(row.temperature),
    powerFactor: num(row.power_factor),
    coverage: num(row.coverage, 100),
    baselineKw:
      row.baseline_kw === null || row.baseline_kw === undefined ? undefined : num(row.baseline_kw),
    idleMinutes: num(row.idle_minutes),
    lastUpdate: str(row.last_update),
    quality: (row.quality as DataQuality | null) ?? undefined,
    online: row.online !== false,
    lastMessageAt: isoOrNull(row.last_message_at),
  }
}

const MACHINE_COLUMNS = `id, tenant_id, code, name, type, sector, gateway,
  nominal_power_kw, p_off_kw, p_run_kw, baseline_kw,
  voltage, current, power, consumption, temperature, power_factor,
  coverage, last_update, quality, online, last_message_at, idle_minutes`

export function createPostgresMachineRepository(db: DatabasePort): IMachineRepository {
  return {
    async list(query: MachineQuery = {}): Promise<MachineRecord[]> {
      const conditions = ["deleted_at IS NULL"]
      const values: unknown[] = []
      if (query.sector) {
        values.push(query.sector)
        conditions.push(`sector = $${values.length}`)
      }
      const { rows } = await db.query<Row>(
        `SELECT ${MACHINE_COLUMNS} FROM machines
          WHERE ${conditions.join(" AND ")}
          ORDER BY code`,
        values,
      )
      return rows.map(toMachineRecord)
    },

    async findById(id: string): Promise<MachineRecord | null> {
      const { rows } = await db.query<Row>(
        `SELECT ${MACHINE_COLUMNS} FROM machines
          WHERE code = $1 AND deleted_at IS NULL`,
        [id],
      )
      return rows[0] ? toMachineRecord(rows[0]) : null
    },

    async count(): Promise<number> {
      const { rows } = await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM machines WHERE deleted_at IS NULL",
      )
      return rows[0]?.n ?? 0
    },

    async save(machine: MachineRecord): Promise<MachineRecord> {
      const { rows } = await db.query<Row>(
        `INSERT INTO machines
           (tenant_id, code, name, type, sector, gateway, status,
            nominal_power_kw, p_off_kw, p_run_kw, baseline_kw,
            voltage, current, power, consumption, temperature, power_factor,
            coverage, last_update, quality, online, last_message_at, idle_minutes)
         VALUES
           (app_current_tenant(), $1, $2, $3, $4, $5, 'STOPPED',
            $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22)
         RETURNING ${MACHINE_COLUMNS}`,
        [
          machine.id, machine.name, machine.type, machine.sector, machine.gateway,
          machine.nominalKW, machine.pOff, machine.pRun, machine.baselineKw ?? null,
          machine.voltage, machine.current, machine.power, machine.consumption,
          machine.temperature, machine.powerFactor, machine.coverage,
          machine.lastUpdate, machine.quality ?? null, machine.online !== false,
          machine.lastMessageAt ?? null, machine.idleMinutes ?? 0,
        ],
      )
      return toMachineRecord(rows[0] ?? {})
    },

    async update(id: string, patch: Partial<MachineRecord>): Promise<MachineRecord | null> {
      const assignments: string[] = []
      const values: unknown[] = []
      const set = (column: string, value: unknown): void => {
        values.push(value)
        assignments.push(`${column} = $${values.length}`)
      }

      if (patch.name !== undefined) set("name", patch.name)
      if (patch.type !== undefined) set("type", patch.type)
      if (patch.sector !== undefined) set("sector", patch.sector)
      if (patch.gateway !== undefined) set("gateway", patch.gateway)
      if (patch.nominalKW !== undefined) set("nominal_power_kw", patch.nominalKW)
      if (patch.pOff !== undefined) set("p_off_kw", patch.pOff)
      if (patch.pRun !== undefined) set("p_run_kw", patch.pRun)
      if (patch.baselineKw !== undefined) set("baseline_kw", patch.baselineKw)
      if (patch.voltage !== undefined) set("voltage", patch.voltage)
      if (patch.current !== undefined) set("current", patch.current)
      if (patch.power !== undefined) set("power", patch.power)
      if (patch.consumption !== undefined) set("consumption", patch.consumption)
      if (patch.temperature !== undefined) set("temperature", patch.temperature)
      if (patch.powerFactor !== undefined) set("power_factor", patch.powerFactor)
      if (patch.coverage !== undefined) set("coverage", patch.coverage)
      if (patch.lastUpdate !== undefined) set("last_update", patch.lastUpdate)
      if (patch.quality !== undefined) set("quality", patch.quality)
      if (patch.online !== undefined) set("online", patch.online)
      if (patch.lastMessageAt !== undefined) set("last_message_at", patch.lastMessageAt)
      if (patch.idleMinutes !== undefined) set("idle_minutes", patch.idleMinutes)
      if (!assignments.length) return this.findById(id)

      values.push(id)
      const { rows } = await db.query<Row>(
        `UPDATE machines SET ${assignments.join(", ")}
          WHERE code = $${values.length} AND deleted_at IS NULL
        RETURNING ${MACHINE_COLUMNS}`,
        values,
      )
      return rows[0] ? toMachineRecord(rows[0]) : null
    },

    async remove(id: string): Promise<boolean> {
      const { rowCount } = await db.query(
        "DELETE FROM machines WHERE code = $1 AND deleted_at IS NULL",
        [id],
      )
      return (rowCount ?? 0) > 0
    },
  }
}
/** Traduz o code da maquina para o UUID da FK (null quando nao existe). */
export async function machineUuid(db: DatabasePort, code: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    "SELECT id::text AS id FROM machines WHERE code = $1 AND deleted_at IS NULL",
    [code],
  )
  return rows[0]?.id ?? null
}

export function createPostgresTelemetryRepository(db: DatabasePort): ITelemetryRepository {
  return {
    /**
     * Insercao com deduplicacao real: ON CONFLICT (machine_id, ts) DO
     * NOTHING. Retorna false quando a linha ja existia (ou a maquina nao).
     */
    async append(reading: TelemetryReading): Promise<boolean> {
      const { rowCount } = await db.query(
        `INSERT INTO telemetry
           (tenant_id, machine_id, ts, power_kw, energy_kwh, voltage_v, current_a,
            power_factor, temperature_c, state, quality, source, sensor_id)
         SELECT m.tenant_id, m.id, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                (SELECT s.id FROM sensors s
                  WHERE s.identifier = $11 AND s.tenant_id = m.tenant_id LIMIT 1)
           FROM machines m WHERE m.code = $12 AND m.deleted_at IS NULL
         ON CONFLICT (machine_id, ts) DO NOTHING`,
        [
          reading.ts.toISOString(),
          reading.powerKw,
          reading.energyKwh,
          reading.voltageV,
          reading.currentA,
          reading.powerFactor,
          reading.temperatureC,
          reading.state,
          reading.quality,
          reading.source,
          reading.sensorId ?? "",
          reading.machineId,
        ],
      )
      return (rowCount ?? 0) > 0
    },

    async listByMachine(query: TelemetryQuery): Promise<TelemetryReading[]> {
      const values: unknown[] = [query.machineId]
      const conditions = ["m.code = $1"]
      if (query.from) {
        values.push(query.from.toISOString())
        conditions.push(`t.ts >= $${values.length}`)
      }
      if (query.to) {
        values.push(query.to.toISOString())
        conditions.push(`t.ts <= $${values.length}`)
      }
      let limitClause = ""
      if (query.limit && query.limit > 0) {
        values.push(query.limit)
        limitClause = `LIMIT $${values.length}`
      }
      const { rows } = await db.query<Row>(
        `SELECT t.ts, t.power_kw, t.energy_kwh, t.voltage_v, t.current_a,
                t.power_factor, t.temperature_c, t.state, t.quality, t.source
           FROM telemetry t
           JOIN machines m ON m.id = t.machine_id
          WHERE ${conditions.join(" AND ")}
          ORDER BY t.ts ASC
          ${limitClause}`,
        values,
      )
      return rows.map((row) => ({
        machineId: query.machineId,
        ts: new Date(str(row.ts)),
        powerKw: num(row.power_kw),
        energyKwh: row.energy_kwh === null ? null : num(row.energy_kwh),
        voltageV: row.voltage_v === null ? null : num(row.voltage_v),
        currentA: row.current_a === null ? null : num(row.current_a),
        powerFactor: row.power_factor === null ? null : num(row.power_factor),
        temperatureC: row.temperature_c === null ? null : num(row.temperature_c),
        state: (row.state as MachineState) ?? "STOPPED",
        quality: row.quality as DataQuality,
        source: row.source as TelemetryReading["source"],
      }))
    },

    async count(): Promise<number> {
      const { rows } = await db.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM telemetry",
      )
      return rows[0]?.n ?? 0
    },

    /** Contadores derivados da propria serie (sem contador paralelo). */
    async recordQuality(): Promise<ReadingsCounters> {
      const { rows } = await db.query<{ quality: string; n: number }>(
        "SELECT quality, count(*)::int AS n FROM telemetry GROUP BY quality",
      )
      const counters: ReadingsCounters = { good: 0, missing: 0, outlier: 0, duplicate: 0 }
      for (const row of rows) {
        if (row.quality === "GOOD") counters.good = row.n
        else if (row.quality === "MISSING") counters.missing = row.n
        else if (row.quality === "OUTLIER") counters.outlier = row.n
        else counters.duplicate += row.n
      }
      return counters
    },
  }
}

export function createPostgresMachineStateRepository(db: DatabasePort): IMachineStateRepository {
  function toInterval(row: Row): MachineStateInterval {
    return {
      machineId: str(row.machine_code),
      state: row.state as MachineState,
      fromTs: new Date(str(row.started_at)),
      toTs: row.ended_at ? new Date(str(row.ended_at)) : null,
    }
  }

  return {
    async openInterval(machineId: string, machineState: MachineState, at: Date): Promise<void> {
      const uuid = await machineUuid(db, machineId)
      if (!uuid) return
      const current = await db.query<{ state: string }>(
        "SELECT state FROM machine_states WHERE machine_id = $1::uuid AND ended_at IS NULL",
        [uuid],
      )
      // Mesmo estado: nada a fechar (evita fragmentar a serie).
      if (current.rows[0]?.state === machineState) return
      if (current.rows[0]) {
        await db.query(
          "UPDATE machine_states SET ended_at = $2 WHERE machine_id = $1::uuid AND ended_at IS NULL",
          [uuid, at.toISOString()],
        )
      }
      await db.query(
        `INSERT INTO machine_states (tenant_id, machine_id, started_at, state)
         SELECT tenant_id, id, $2, $3 FROM machines WHERE id = $1::uuid`,
        [uuid, at.toISOString(), machineState],
      )
    },

    async current(machineId: string): Promise<MachineStateInterval | null> {
      const { rows } = await db.query<Row>(
        `SELECT ms.state, ms.started_at, ms.ended_at, m.code AS machine_code
           FROM machine_states ms
           JOIN machines m ON m.id = ms.machine_id
          WHERE m.code = $1 AND ms.ended_at IS NULL
          ORDER BY ms.started_at DESC LIMIT 1`,
        [machineId],
      )
      return rows[0] ? toInterval(rows[0]) : null
    },

    async list(machineId: string, from?: Date): Promise<MachineStateInterval[]> {
      const values: unknown[] = [machineId]
      let sql = `SELECT ms.state, ms.started_at, ms.ended_at, m.code AS machine_code
                   FROM machine_states ms
                   JOIN machines m ON m.id = ms.machine_id
                  WHERE m.code = $1`
      if (from) {
        values.push(from.toISOString())
        sql += ` AND ms.started_at >= $${values.length}`
      }
      sql += " ORDER BY ms.started_at ASC"
      const { rows } = await db.query<Row>(sql, values)
      return rows.map(toInterval)
    },

    async idleMinutes(machineId: string, now: Date): Promise<number> {
      const open = await this.current(machineId)
      if (!open || open.state !== "IDLE") return 0
      return Number(((now.getTime() - open.fromTs.getTime()) / 60000).toFixed(1))
    },
  }
}


