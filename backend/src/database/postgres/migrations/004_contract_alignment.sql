-- ===========================================================================
-- EnergyMatrix EMS - migration 004: alinhamento do schema aos contratos
--
-- Motivacao: os ports do dominio usam ids de negocio textuais (ALT-2026-0041,
-- INT-014, evt-..., imp-...) e um "snapshot" por maquina que a tabela `machines`
-- ainda nao possui. Esta migration ADICIONA colunas/tabelas; nada e removido.
--
-- Convencoes:
--   - `code` = id de negocio visivel na API (UNIQUE por tenant);
--   - o PK UUID continua sendo a referencia interna das FKs;
--   - datas exibidas (dd/mm/aaaa hh:mm ou ISO local) ficam em TEXT porque o
--     contrato da API as trata como texto de apresentacao.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- machines: strings do contrato + snapshot da ultima leitura (ingestao)
-- ---------------------------------------------------------------------------
ALTER TABLE machines ADD COLUMN IF NOT EXISTS sector TEXT NOT NULL DEFAULT '';
ALTER TABLE machines ADD COLUMN IF NOT EXISTS gateway TEXT NOT NULL DEFAULT '';
ALTER TABLE machines ADD COLUMN IF NOT EXISTS power DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS voltage DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS current DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS temperature DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS power_factor DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS consumption DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS coverage DOUBLE PRECISION NOT NULL DEFAULT 100;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS last_update TEXT NOT NULL DEFAULT '';
ALTER TABLE machines ADD COLUMN IF NOT EXISTS quality TEXT;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS online BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ;
ALTER TABLE machines ADD COLUMN IF NOT EXISTS idle_minutes INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- alerts: id de negocio (`code`) + campos de evidencia do contrato
-- ---------------------------------------------------------------------------
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS code TEXT NOT NULL DEFAULT '';
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS machine_label TEXT NOT NULL DEFAULT '';
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS sector TEXT NOT NULL DEFAULT '';
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS anomaly TEXT NOT NULL DEFAULT '';
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS anomaly_type TEXT NOT NULL DEFAULT '';
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS condition TEXT NOT NULL DEFAULT '';
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS peak_time TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS detected_at TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS auto BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS idle_cost TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_at TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS assignee TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS estimated BOOLEAN NOT NULL DEFAULT FALSE;

-- O contrato usa status minusculo ('open'/'acknowledged'/'resolved') e
-- `message` e opcional; `type` acompanha anomaly_type.
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_status_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_status_check
  CHECK (status IN ('open','acknowledged','resolved'));
ALTER TABLE alerts ALTER COLUMN message DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_alerts_tenant_code ON alerts (tenant_id, code) WHERE code <> '';

-- ---------------------------------------------------------------------------
-- interventions: id de negocio + colunas antes x depois do contrato
-- ---------------------------------------------------------------------------
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS code TEXT NOT NULL DEFAULT '';
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS date_label TEXT NOT NULL DEFAULT '';
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS machine_label TEXT NOT NULL DEFAULT '';
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS before_value DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS after_value DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS saved_value DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS period TEXT NOT NULL DEFAULT '';
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS confidence TEXT NOT NULL DEFAULT 'estimado';
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS simulated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS estimated BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS saved_kwh_day DOUBLE PRECISION;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS saved_brl_day DOUBLE PRECISION;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS machine_code TEXT NOT NULL DEFAULT '';

ALTER TABLE interventions DROP CONSTRAINT IF EXISTS interventions_status_check;
ALTER TABLE interventions ADD CONSTRAINT interventions_status_check
  CHECK (status IN ('open','in_progress','completed','cancelled','active'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_interventions_tenant_code ON interventions (tenant_id, code) WHERE code <> '';

-- ---------------------------------------------------------------------------
-- machine_events / impact_analyses: id de negocio
-- ---------------------------------------------------------------------------
ALTER TABLE machine_events ADD COLUMN IF NOT EXISTS code TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_machine_events_tenant_code ON machine_events (tenant_id, code) WHERE code <> '';

ALTER TABLE impact_analyses ADD COLUMN IF NOT EXISTS code TEXT NOT NULL DEFAULT '';
ALTER TABLE impact_analyses ADD COLUMN IF NOT EXISTS trigger_event_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_impact_tenant_code ON impact_analyses (tenant_id, code) WHERE code <> '';

-- ---------------------------------------------------------------------------
-- sites/sectors: code de negocio (SP-GRU, A, B, C, D)
-- ---------------------------------------------------------------------------
ALTER TABLE sites ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE sectors ADD COLUMN IF NOT EXISTS code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sites_tenant_code ON sites (tenant_id, code) WHERE code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sectors_tenant_code ON sectors (tenant_id, code) WHERE code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- scenarios: estado do Competition Mode persistido POR TENANT
-- (scenario, step, alertSeq, alerts e interventions do demo)
-- ---------------------------------------------------------------------------
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS state JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS uq_scenarios_tenant ON scenarios (tenant_id);

-- ---------------------------------------------------------------------------
-- tenant_config: configuracao por tenant (tarifa, limiares, turnos) e
-- read models seedados (series de relatorio, contadores de leitura).
-- Chave-valor JSONB: um registro por (tenant_id, key).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_config (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, key)
);

-- ---------------------------------------------------------------------------
-- protocols: modulo protocolar (id de negocio EMS-AAAA-NNNN e a PK).
-- Datas do contrato ficam em TEXT (formato ISO local do dominio).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS protocols (
  id           TEXT PRIMARY KEY,
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  machine_code TEXT NOT NULL DEFAULT '',
  machine      TEXT NOT NULL DEFAULT '',
  sector       TEXT NOT NULL DEFAULT '',
  origin       TEXT NOT NULL DEFAULT 'Outro',
  priority     TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','pending_validation','closed','cancelled')),
  alert_id     TEXT,
  assignee     TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  opened_at    TEXT NOT NULL,
  deadline     TEXT,
  closed_at    TEXT,
  evidence     JSONB NOT NULL DEFAULT '[]'::jsonb,
  events       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_protocols_tenant_status ON protocols (tenant_id, status);

-- ---------------------------------------------------------------------------
-- production_records: indice de apoio a normalizacao de intervencoes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_production_tenant_machine
  ON production_records (tenant_id, machine_id, period_start DESC);

-- ---------------------------------------------------------------------------
-- RLS nas tabelas novas (mesma politica da 001) + triggers de updated_at
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['tenant_config','protocols']) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I'
      || ' USING (tenant_id = app_current_tenant())'
      || ' WITH CHECK (tenant_id = app_current_tenant())', t);
    EXECUTE format('DROP TRIGGER IF EXISTS touch_updated_at ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER touch_updated_at BEFORE UPDATE ON %I'
      || ' FOR EACH ROW EXECUTE FUNCTION app_touch_updated_at()', t);
  END LOOP;
END $$;

-- Garantias explicitas para o papel da aplicacao (tabelas novas).
GRANT SELECT, INSERT, UPDATE, DELETE ON tenant_config, protocols TO energymatrix_app;

-- ---------------------------------------------------------------------------
-- Ajustes de contrato descobertos na auditoria dos ports
-- ---------------------------------------------------------------------------

-- O State Engine deriva ANOMALY/OFFLINE/MAINTENANCE; o CHECK so aceitava os
-- tres estados de energia e recusaria a escrita da ingestao.
ALTER TABLE machine_states DROP CONSTRAINT IF EXISTS machine_states_state_check;
ALTER TABLE machine_states ADD CONSTRAINT machine_states_state_check
  CHECK (state IN ('STOPPED','IDLE','RUNNING','ANOMALY','OFFLINE','MAINTENANCE'));

-- Relacoes usam id de negocio (rel-0001) visivel na API.
ALTER TABLE machine_relationships ADD COLUMN IF NOT EXISTS code TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS uq_relationships_tenant_code
  ON machine_relationships (tenant_id, code) WHERE code <> '';

-- Audit log usa id de negocio (aud-...) - sem FKs referenciando a PK.
ALTER TABLE audit_logs ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE audit_logs ALTER COLUMN id DROP DEFAULT;

-- Classificacao de origem inclui ESTIMATED (secao 4 do prompt mestre).
ALTER TABLE telemetry DROP CONSTRAINT IF EXISTS telemetry_source_check;
ALTER TABLE telemetry ADD CONSTRAINT telemetry_source_check
  CHECK (source IN ('REAL','SIMULATED','ESTIMATED'));


