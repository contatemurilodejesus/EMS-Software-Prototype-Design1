-- ===========================================================================
-- EnergyMatrix EMS - migration 002: TimescaleDB (OPCIONAL)
--
-- O projeto FUNCIONA sem esta extensao: se o `CREATE EXTENSION` falhar, o
-- hypertable e as politicas de retencao sao simplesmente ignoradas e a
-- telemetria continua em tabela comum. Nao ha dependencia obrigatoria.
--
-- TimescaleDB exige `shared_preload_libraries`; por isso o compose sobe com a
-- imagem `timescale/timescaledb`, que ja vem com a extensao carregada.
-- ===========================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
    RAISE NOTICE 'timescaledb indisponivel: telemetria permanece em tabela comum.';
    RETURN;
  END IF;

  BEGIN
    CREATE EXTENSION IF NOT EXISTS timescaledb;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'CREATE EXTENSION timescaledb falhou (%): seguindo sem hypertable.', SQLERRM;
    RETURN;
  END;
END $$;

-- Hipertabela: particiona a serie temporal por tempo (7 dias por chunk).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable(
      'telemetry',
      'ts',
      chunk_time_interval => INTERVAL '7 days',
      if_not_exists => TRUE,
      migrate_data => TRUE
    );
    RAISE NOTICE 'telemetry convertida em hypertable (chunks de 7 dias).';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- A conversao exige PK contendo ts, que a migration 001 ja garante.
  RAISE NOTICE 'hypertable nao aplicada (%): telemetria em tabela comum.', SQLERRM;
END $$;

-- Retencao configuravel (RETEcao_TELEMETRY_DAYS, default 365).
-- Retencao e um requisito de operacao: dado de 1 ano e o piso do MVP.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM add_retention_policy(
      'telemetry',
      INTERVAL '365 days',
      if_not_exists => TRUE
    );
    RAISE NOTICE 'retencao de 365 dias aplicada a telemetry.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'politica de retencao nao aplicada (%).', SQLERRM;
END $$;