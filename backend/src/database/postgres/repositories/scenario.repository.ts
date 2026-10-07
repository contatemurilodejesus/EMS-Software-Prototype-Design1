/**
 * Repository PostgreSQL - Competition Mode (scenarios). O estado do demo e
 * persistido por tenant em `scenarios.state` (JSONB); o simulador que gera o
 * snapshot fica no container e e o mesmo que o adaptador memoria. Cada mutacao
 * (setScenario/step/reset/addIntervention) escreve o snapshot; a primeira
 * leitura restaura o estado salvo a partir do banco.
 */

import type {
  Alert,
  CompetitionInterventionRecord,
  CompetitionSnapshot,
  CompetitionTelemetryPoint,
} from "../../../domain/entities/index.ts";
import type { IScenarioRepository } from "../../../domain/ports/index.ts";
import type { CompetitionSimulator } from "../../../simulator/competition.ts";
import type { DatabasePort } from "../pool.ts";

function clone(o: unknown): unknown {
  try { return JSON.parse(JSON.stringify(o)); } catch { return {}; }
}

export function createPostgresScenarioRepository(
  db: DatabasePort,
  simulator: CompetitionSimulator,
): IScenarioRepository {
  const persist = async (s: CompetitionSnapshot): Promise<void> => {
    await db.query(
      `INSERT INTO scenarios (tenant_id, name, state, current_step)
       VALUES (app_current_tenant(), $1, $2::jsonb, $3)
       ON CONFLICT (tenant_id) DO UPDATE SET state = EXCLUDED.state, current_step = EXCLUDED.current_step, updated_at = now()`,
      [s.scenario, clone(s), s.step],
    );
  };

  const restore = async (): Promise<CompetitionSnapshot | null> => {
    const { rows } = await db.query<{ state: unknown; current_step: number }>(
      `SELECT state, current_step FROM scenarios WHERE tenant_id = app_current_tenant() ORDER BY updated_at DESC LIMIT 1`,
    );
    if (!rows[0]?.state) return null;
    const s = clone(rows[0].state) as CompetitionSnapshot;
    // Restaura os campos nucleares do estado interno do simulador a partir do
    // snapshot persistido. `simulated`/`deterministic`/`alertSeq` mantem o valor
    // do estado atual (nao fazem parte do snapshot serializado).
    simulator.state = {
      ...simulator.state,
      scenario: s.scenario,
      step: s.step,
      machines: s.machines as unknown as typeof simulator.state.machines,
      alerts: s.alerts,
      interventions: s.interventions as typeof simulator.state.interventions,
    };
    return s;
  };

  const snapshot = async (): Promise<CompetitionSnapshot> => {
    const restored = await restore();
    if (restored) return restored;
    const st = simulator.status();
    const snap: CompetitionSnapshot = {
      scenario: st.scenario, step: st.step, simulated: true, deterministic: true,
      scenarioLabel: st.scenarioLabel, targetMachine: st.targetMachine, note: st.note,
      scenarios: st.scenarios, kpis: st.kpis, alerts: st.alerts, interventions: st.interventions,
      beforeAfter: st.beforeAfter, machines: simulator.machines(), analytics: simulator.analytics(),
    };
    await persist(snap);
    return snap;
  };

  return {
    async snapshot(): Promise<CompetitionSnapshot> { return snapshot(); },
    async setScenario(scenario: string): Promise<CompetitionSnapshot> {
      simulator.reset(scenario as any);
      const s = await snapshot();
      await persist(s);
      return s;
    },
    async step(): Promise<CompetitionSnapshot> {
      simulator.step();
      const s = await snapshot();
      await persist(s);
      return s;
    },
    async reset(): Promise<CompetitionSnapshot> {
      simulator.reset("NORMAL");
      const s = await snapshot();
      await persist(s);
      return s;
    },
    async telemetry(machineId: string): Promise<CompetitionTelemetryPoint[] | null> {
      const pts = simulator.telemetry(machineId);
      return pts ?? null;
    },
    async addIntervention(input: { machineId?: string; before: number; after: number }): Promise<CompetitionInterventionRecord> {
      const i = simulator.addIntervention(input);
      const s = await snapshot();
      await persist(s);
      return i;
    },
    async advanceAlert(id: string): Promise<Alert | null> {
      const a = simulator.advanceAlert(id);
      if (a) {
        const s = await snapshot();
        await persist(s);
      }
      return a ?? null;
    },
  };
}
