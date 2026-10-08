-- ===========================================================================
-- EnergyMatrix EMS - migration 005: autenticacao pre-tenant + ids de sessao
--
-- PROBLEMA (secao 6 do prompt mestre): `login`, `refresh`, `logout` e
-- `acceptInvite` consultam `users`/`refresh_tokens`/`invites` ANTES de existir
-- tenant no contexto da requisicao. Com RLS ativa e papel comum
-- (`energymatrix_app`, NOSUPERUSER NOBYPASSRLS), um SELECT direto devolve
-- ZERO linhas sem `app.tenant_id` - o login nunca encontraria o usuario.
--
-- SOLUCAO: funcoes SECURITY DEFINER de lookup, criadas pela migracao e
-- executadas pelo papel da aplicacao:
--   - devolvem SOMENTE os campos necessarios a autenticacao;
--   - recebem o valor buscado como PARAMETRO (nada de concatenacao de SQL);
--   - `search_path` fixo em `public` (defesa contra search_path injection);
--   - EXECUTE revogado de PUBLIC e concedido somente a `energymatrix_app`.
--
-- ATENCAO: a funcao so bypassa RLS se o DONO dela bypassar RLS (superuser ou
-- NOBYPASSRLS). No compose as migracoes rodam como `energymatrix` (superuser)
-- e o papel `energymatrix_app` recebe apenas EXECUTE.
--
-- Tambem alinha os PKs de `invites`/`refresh_tokens` ao contrato da API
-- (`inv-...` / `rt-...`), como ja foi feito para `audit_logs` na 004: com
-- coluna UUID, o INSERT do refresh token no login falharia em PostgreSQL.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Ids de negocio do contrato (texto) em vez de UUID
-- ---------------------------------------------------------------------------
ALTER TABLE invites ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE invites ALTER COLUMN id DROP DEFAULT;
ALTER TABLE refresh_tokens ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE refresh_tokens ALTER COLUMN id DROP DEFAULT;

-- ---------------------------------------------------------------------------
-- Lookup de login: e-mail -> somente os campos de autenticacao.
-- `users.email` e unico globalmente (D15); a funcao e propositalmente
-- global (o login acontece antes de qualquer tenant).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_auth_find_user_by_email(p_email TEXT)
RETURNS TABLE (
  id            UUID,
  tenant_id     UUID,
  name          TEXT,
  email         TEXT,
  password_hash TEXT,
  role          TEXT,
  status        TEXT,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.tenant_id, u.name, u.email, u.password_hash, u.role,
         u.status, u.last_login_at, u.created_at, u.updated_at
    FROM users u
   WHERE lower(u.email) = lower(p_email)
   LIMIT 1
$$;

COMMENT ON FUNCTION app_auth_find_user_by_email(TEXT) IS
  'Lookup pre-tenant do login: devolve somente campos de autenticacao pelo e-mail.';

-- ---------------------------------------------------------------------------
-- Lookup de refresh/logout: hash SHA-256 do refresh token -> registro.
-- Devolve tambem o tenant_id para que a REVOGACAO rode dentro da RLS do
-- proprio tenant (a aplicacao reentra no contexto com runWithActor).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_auth_find_refresh_by_hash(p_hash TEXT)
RETURNS TABLE (
  id          TEXT,
  tenant_id   UUID,
  user_id     UUID,
  token_hash  TEXT,
  expires_at  TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  ip          INET,
  user_agent  TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.tenant_id, t.user_id, t.token_hash,
         t.expires_at, t.revoked_at, t.ip, t.user_agent
    FROM refresh_tokens t
   WHERE t.token_hash = p_hash
   LIMIT 1
$$;

COMMENT ON FUNCTION app_auth_find_refresh_by_hash(TEXT) IS
  'Lookup pre-tenant do refresh/logout por hash do token (valor puro nunca e persistido).';

-- ---------------------------------------------------------------------------
-- Lookup de convite: hash do codigo -> registro (aceite pre-tenant).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_auth_find_invite_by_code_hash(p_hash TEXT)
RETURNS TABLE (
  id          TEXT,
  tenant_id   UUID,
  role        TEXT,
  code_hash   TEXT,
  expires_at  TIMESTAMPTZ,
  used_at     TIMESTAMPTZ,
  created_by  UUID,
  used_by     UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.tenant_id, i.role, i.code_hash,
         i.expires_at, i.used_at, i.created_by, i.used_by
    FROM invites i
   WHERE i.code_hash = p_hash
   LIMIT 1
$$;

COMMENT ON FUNCTION app_auth_find_invite_by_code_hash(TEXT) IS
  'Lookup pre-tenant do aceite de convite por hash do codigo.';

-- ---------------------------------------------------------------------------
-- Permissoes minimas: nem PUBLIC nem outro papel executa estas funcoes.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION app_auth_find_user_by_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_auth_find_refresh_by_hash(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_auth_find_invite_by_code_hash(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_auth_find_user_by_email(TEXT) TO energymatrix_app;
GRANT EXECUTE ON FUNCTION app_auth_find_refresh_by_hash(TEXT) TO energymatrix_app;
GRANT EXECUTE ON FUNCTION app_auth_find_invite_by_code_hash(TEXT) TO energymatrix_app;
