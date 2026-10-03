-- ===========================================================================
-- EnergyMatrix EMS - migration 001: schema inicial
--
-- Convencoes:
--   - ids UUID com `gen_random_uuid()` (pgcrypto); os ids de seed sao fixos;
--   - dinheiro em `numeric`, telemetria em `double precision`;
--   - status/qualidade com CHECK (portam para enum nativo ou Prisma);
--   - `created_at`/`updated_at` em todas as tabelas;
--   - RLS em TODA tabela com tenant_id (isolamento no banco, alem da aplicacao).
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  timezone    TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  demand_limit_kw NUMERIC,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS sectors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id     UUID REFERENCES sites(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  area_m2     NUMERIC,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

-- ---------------------------------------------------------------------------
-- Identidade
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE CHECK (code IN ('ADMIN','ACCOUNTING','MACHINE_EVALUATOR')),
  description TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,          -- e-mail unico GLOBALMENTE (D15)
  password_hash TEXT NOT NULL,                 -- scrypt; nunca senha em claro
  role          TEXT NOT NULL CHECK (role IN ('ADMIN','ACCOUNTING','MACHINE_EVALUATOR')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','disabled')),
  last_login_at TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (tenant_id);

CREATE TABLE IF NOT EXISTS invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('ADMIN','ACCOUNTING','MACHINE_EVALUATOR')),
  code_hash   TEXT NOT NULL,                   -- o codigo puro nunca e persistido
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  used_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invites_code ON invites (code_hash);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,                   -- SHA-256; o valor puro nao existe aqui
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  ip          INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Ativos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gateways (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  identifier    TEXT NOT NULL UNIQUE,          -- id do gateway no broker (MQTT)
  status        TEXT NOT NULL DEFAULT 'offline'
                CHECK (status IN ('online','offline','warning','maintenance')),
  protocol      TEXT NOT NULL DEFAULT 'MQTT' CHECK (protocol IN ('MQTT','MODBUS','OPCUA')),
  last_seen_at  TIMESTAMPTZ,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gateways_tenant ON gateways (tenant_id);

CREATE TABLE IF NOT EXISTS machines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  site_id          UUID REFERENCES sites(id) ON DELETE SET NULL,
  sector_id        UUID REFERENCES sectors(id) ON DELETE SET NULL,
  gateway_id       UUID REFERENCES gateways(id) ON DELETE SET NULL,
  code             TEXT NOT NULL,             -- 'M-001'; unico por tenant
  name             TEXT NOT NULL,
  type             TEXT NOT NULL DEFAULT 'Geral',
  description      TEXT,
  location         TEXT,
  status           TEXT NOT NULL DEFAULT 'STOPPED'
                   CHECK (status IN ('RUNNING','IDLE','STOPPED','ANOMALY','OFFLINE','MAINTENANCE')),
  nominal_power_kw NUMERIC NOT NULL DEFAULT 10,
  p_off_kw         NUMERIC NOT NULL DEFAULT 1,
  p_run_kw         NUMERIC NOT NULL DEFAULT 5,
  baseline_kw      NUMERIC,
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_machines_tenant ON machines (tenant_id);

CREATE TABLE IF NOT EXISTS sensors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  machine_id    UUID REFERENCES machines(id) ON DELETE CASCADE,
  type          TEXT NOT NULL
                CHECK (type IN ('POWER','CURRENT','VOLTAGE','TEMPERATURE','ENERGY','OTHER')),
  identifier    TEXT NOT NULL,
  unit          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, identifier)
);
-- ---------------------------------------------------------------------------
-- Telemetria (serie temporal). PK (machine_id, ts) = deduplicacao natural.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS telemetry (
  machine_id     UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  gateway_id     UUID REFERENCES gateways(id) ON DELETE SET NULL,
  sensor_id      UUID REFERENCES sensors(id) ON DELETE SET NULL,
  ts             TIMESTAMPTZ NOT NULL,
  power_kw       DOUBLE PRECISION,
  energy_kwh     DOUBLE PRECISION,
  voltage_v      DOUBLE PRECISION,
  current_a      DOUBLE PRECISION,
  power_factor   DOUBLE PRECISION,
  temperature_c  DOUBLE PRECISION,
  state          TEXT,
  quality        TEXT NOT NULL DEFAULT 'GOOD'
                 CHECK (quality IN ('GOOD','MISSING','ESTIMATED','OUTLIER','DUPLICATE')),
  source         TEXT NOT NULL DEFAULT 'REAL' CHECK (source IN ('REAL','SIMULATED')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (machine_id, ts)
);
CREATE INDEX IF NOT EXISTS idx_telemetry_tenant_machine_ts ON telemetry (tenant_id, machine_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_gateway_ts ON telemetry (gateway_id, ts DESC);

CREATE TABLE IF NOT EXISTS machine_states (
  id         BIGSERIAL PRIMARY KEY,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at   TIMESTAMPTZ,            -- nulo = intervalo vigente
  state      TEXT NOT NULL CHECK (state IN ('STOPPED','IDLE','RUNNING'))
);
CREATE INDEX IF NOT EXISTS idx_machine_states_open ON machine_states (machine_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_machine_states_range ON machine_states (machine_id, started_at DESC);

CREATE TABLE IF NOT EXISTS machine_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN
             ('STARTED','STOPPED','IDLE','POWER_HIGH','POWER_LOW','TEMPERATURE_HIGH','OFFLINE','RECOVERY','ANOMALY')),
  severity   TEXT NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  timestamp  TIMESTAMPTZ NOT NULL,
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_machine_events_tenant_ts ON machine_events (tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_machine_events_machine ON machine_events (machine_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS machine_relationships (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_machine_id   UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  target_machine_id   UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  relationship_type   TEXT NOT NULL CHECK (relationship_type IN
                        ('SUPPLIES','FEEDS','DEPENDS_ON','FOLLOWS','COUPLED','PARALLEL','BACKUP')),
  dependency_level    SMALLINT NOT NULL DEFAULT 1 CHECK (dependency_level BETWEEN 1 AND 3),
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_relationship UNIQUE (tenant_id, source_machine_id, target_machine_id, relationship_type),
  CONSTRAINT ck_no_self_relation CHECK (source_machine_id <> target_machine_id)
);
CREATE INDEX IF NOT EXISTS idx_relationships_tenant ON machine_relationships (tenant_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_tokens (token_hash);
-- ---------------------------------------------------------------------------
-- Alertas, intervencoes, custo
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  machine_id   UUID REFERENCES machines(id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'Anomaly',
  severity     TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  status       TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','ACKNOWLEDGED','RESOLVED')),
  message      TEXT NOT NULL,
  evidence     JSONB NOT NULL DEFAULT '{}'::jsonb,
  classification TEXT CHECK (classification IN ('OBSERVED','ESTIMATED','SIMULATED')),
  avoidable_kwh NUMERIC,
  estimated_cost NUMERIC,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant_status ON alerts (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_alerts_machine ON alerts (machine_id, created_at DESC);

CREATE TABLE IF NOT EXISTS alert_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id    UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_events_alert ON alert_events (alert_id, created_at);

CREATE TABLE IF NOT EXISTS interventions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  machine_id         UUID REFERENCES machines(id) ON DELETE SET NULL,
  alert_id           UUID REFERENCES alerts(id) ON DELETE SET NULL,
  description        TEXT NOT NULL,
  responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','in_progress','completed','cancelled')),
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ,
  before_after       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_interventions_tenant ON interventions (tenant_id, started_at DESC);

CREATE TABLE IF NOT EXISTS tariffs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  price_per_kwh  NUMERIC NOT NULL CHECK (price_per_kwh >= 0),
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Uma tariff ativa por tenant (indice unico parcial).
CREATE UNIQUE INDEX IF NOT EXISTS uq_tariff_active_per_tenant
  ON tariffs (tenant_id) WHERE active;

CREATE TABLE IF NOT EXISTS impact_analyses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trigger_event_id UUID REFERENCES machine_events(id) ON DELETE SET NULL,
  machine_id      UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  window_start    TIMESTAMPTZ NOT NULL,
  window_end      TIMESTAMPTZ NOT NULL,
  avoidable_kwh   NUMERIC NOT NULL DEFAULT 0,
  estimated_cost  NUMERIC NOT NULL DEFAULT 0,
  classification  TEXT NOT NULL CHECK (classification IN ('OBSERVED','ESTIMATED','SIMULATED')),
  evidence        JSONB NOT NULL DEFAULT '{}'::jsonb,
  alert_id        UUID REFERENCES alerts(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_impact_tenant ON impact_analyses (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS production_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  machine_id  UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end   TIMESTAMPTZ NOT NULL,
  units       NUMERIC NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scenarios (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'idle',
  current_step INTEGER NOT NULL DEFAULT 0,
  started_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auditoria: SEM FK para tenant (mandate 12) - nao pode travar listagem.
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID,
  user_id     UUID,
  action      TEXT NOT NULL,
  resource    TEXT NOT NULL,
  resource_id TEXT,
  result      TEXT NOT NULL DEFAULT 'success',
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip          INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON audit_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs (resource, resource_id);
-- ===========================================================================
-- ROW LEVEL SECURITY (Fase 3)
--
-- A politica le `app.tenant_id`, definido pela aplicacao em cada operacao via
-- `set_config`. SEM essa variavel, ZERO linhas ficam visiveis: o isolamento passa
-- a valer no BANCO, e nao apenas na camada de aplicacao.
--
-- `FORCE ROW LEVEL SECURITY` e essencial: sem ele, o dono da tabela ignoraria a
-- politica.
-- ===========================================================================

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.tenant_id', TRUE), '')::UUID
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  t TEXT;
BEGIN
  -- `audit_logs` fica de fora: a listagem pode cruzar tenants por papel.
  FOR t IN
    SELECT unnest(ARRAY[
      'sites','sectors','users','invites','refresh_tokens','gateways','machines',
      'sensors','telemetry','machine_states','machine_events','machine_relationships',
      'alerts','alert_events','interventions','tariffs','impact_analyses',
      'production_records','scenarios'
    ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    -- PL/pgSQL nao concatena literais em linhas separadas (diferente de C):
    -- por isso o SQL e montado com || .
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I'
      || ' USING (tenant_id = app_current_tenant())'
      || ' WITH CHECK (tenant_id = app_current_tenant())', t);
  END LOOP;
END $$;

-- `COMMENT ON ... IS` exige um literal unico (nao aceita expressao com ||),
-- por isso a frase fica em uma linha.
COMMENT ON FUNCTION app_current_tenant() IS 'Tenant da requisicao, lido de app.tenant_id. Vazio = nenhuma linha visivel.';

-- ---------------------------------------------------------------------------
-- `updated_at` mantido pelo banco (a aplicacao nao precisa lembrar).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'tenants','sites','sectors','users','invites','gateways','machines','sensors',
      'alerts','interventions','tariffs','scenarios'
    ])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS touch_updated_at ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER touch_updated_at BEFORE UPDATE ON %I'
      || ' FOR EACH ROW EXECUTE FUNCTION app_touch_updated_at()', t);
  END LOOP;
END $$;