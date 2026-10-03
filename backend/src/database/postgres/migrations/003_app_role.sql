-- ===========================================================================
-- EnergyMatrix EMS - migration 003: papel de aplicacao SEM superusuario
--
-- ACHADO REAL (validado em `backend/tests/rls.proof.ts`):
--   O owner criado pelo `POSTGRES_USER` do container e SUPERUSER. Superuser
--   ignora RLS mesmo com `FORCE ROW LEVEL SECURITY`. Sem esta migration, toda a
--   politica da 001 seria decorativa em desenvolvimento.
--
-- Solucao: a aplicacao conecta com um papel COMUM, sem BYPASSRLS e sem
-- superusuario. As migrations continuam rodando com o papel de administracao
-- (necessario para criar schema e politicas).
--

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'energymatrix_app') THEN
    -- NOSUPERUSER e NOBYPASSRLS sao o ponto central desta migration.
    CREATE ROLE energymatrix_app
      LOGIN
      PASSWORD 'energymatrix_app'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END $$;

-- Garante as garantias mesmo se o papel ja existisse.
DO $$
BEGIN
  EXECUTE 'ALTER ROLE energymatrix_app NOSUPERUSER';
  EXECUTE 'ALTER ROLE energymatrix_app NOBYPASSRLS';
  EXECUTE 'ALTER ROLE energymatrix_app NOCREATEDB';
  EXECUTE 'ALTER ROLE energymatrix_app NOCREATEROLE';
END $$;

--  migrate/seed -> papel `energymatrix` (superusuario)
--  backend HTTP -> papel `energymatrix_app` (comum, sem bypassrls)
--
-- Concessoes: apenas o necessario. `energymatrix` segue sendo o dono/admin.
GRANT USAGE ON SCHEMA public TO energymatrix_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO energymatrix_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO energymatrix_app;

-- Tabelas futuras (rodar novamente apos novas migrations).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO energymatrix_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO energymatrix_app;

COMMENT ON ROLE energymatrix_app IS
  'Papel usado pelo backend. SEM superusuario e SEM bypassrls: e ele quem faz a '
  'RLS valer. O papel energymatrix fica reservado a migrate/seed.';