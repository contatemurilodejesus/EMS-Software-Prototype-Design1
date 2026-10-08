# EnergyMatrix — Segurança

Este documento descreve as decisões de segurança do MVP **e a evidência de cada
uma**. Onde algo é "experimental" ou "não validado", está escrito assim — sem
maquiagem.

## 1. Cadeia de autenticação e isolamento

```
JWT (HS256, access 15min)
   ↓
middleware authenticate  → verifica assinatura/expiração + usuário ativo
   ↓
runWithActor({tenantId, userId, role})   (AsyncLocalStorage)
   ↓
requisição roda COM contexto de tenant
   ↓
pool PostgreSQL: SELECT set_config('app.tenant_id', $1) NA MESMA conexão da query
   ↓
RLS: WHERE tenant_id = app_current_tenant()   (defesa em profundidade)
```

Regras:

- `tenantId` vem **sempre** das claims do token — nunca de body/query/header.
- O pool aplica `app.tenant_id` por conexão (com cache por client e invalidação
  no release da transação): nenhuma query roda com tenant de request anterior.
- Fora de contexto (migrations, jobs), `resolveTenant` retorna `null` e a RLS
  esconde **todas** as linhas.
- Um request autenticado no Tenant A seguido de request no Tenant B (e volta ao
  A) não vaza contexto — coberto pelo teste
  `ISOLAMENTO sequencial: A -> B -> A nao vaza contexto entre requests`
  em `backend/tests/api.test.ts`.

## 2. Login + RLS (decisão arquitetural — P0)

**Problema:** `login`, `refresh`, `logout` e `acceptInvite` consultam
`users`/`refresh_tokens`/`invites` **antes** de existir tenant no contexto.
Com RLS ativa e o papel comum da aplicação, um `SELECT` direto devolve **zero
linhas** — o login não encontraria o usuário.

**O que NÃO foi feito (e por quê):**

- Não desligamos a RLS nessas tabelas — o isolamento é requisito.
- Não colocamos o backend como superuser — o superuser ignora RLS mesmo com
  `FORCE ROW LEVEL SECURITY` (foi exatamente o achado da Fase 3).

**Solução adotada (migration `005_auth_pre_tenant.sql`):**

```sql
app_auth_find_user_by_email(p_email TEXT)      -- login
app_auth_find_refresh_by_hash(p_hash TEXT)     -- refresh / logout
app_auth_find_invite_by_code_hash(p_hash TEXT) -- aceite de convite
```

Garantias das funções:

| Garantia | Como |
| --- | --- |
| Sem SQL injection | valor sempre chega como **parâmetro** (`$1`), nunca concatenado |
| `search_path` seguro | `SET search_path = public` na função |
| Retorno mínimo | somente campos de autenticação (hash, papel, status, tenant) |
| Permissões mínimas | `REVOKE ... FROM PUBLIC` + `GRANT EXECUTE` só para `energymatrix_app` |
| Pré-tenant funciona | `SECURITY DEFINER`: executa com o dono da migração (superuser) |
**Fluxo resultante:**

```
login
 ↓ app_auth_find_user_by_email (SECURITY DEFINER, pré-tenant)
 ↓ validação de senha (scrypt, comparação em tempo constante)
 ↓ runWithActor({tenantId do usuário})   ← contexto criado AQUI
 ↓ update last_login + gravação do refresh token (sob RLS do próprio tenant)
 ↓ sessão emitida
```

`refresh`/`logout` usam `app_auth_find_refresh_by_hash` para localizar o token
(e o `tenantId`) e então **reentram no contexto do próprio token** para
revogar/rotacionar dentro da RLS.

**Restrição documentada:** a função só contorna a RLS se o **dono** dela
contornar RLS (superuser/`BYPASSRLS`). No compose as migrações rodam como
`energymatrix` (superuser) e o papel `energymatrix_app` recebe apenas
`EXECUTE`.

**Validação:** código + typecheck + suítes de API (memória). A validação
Postgres+RLS das funções depende de ambiente com Docker/Postgres ativo
(`backend/proof/rls.proof.ts`); **não foi executada nesta máquina** (Docker
indisponível) — pendência P0 de ambiente.

## 3. Papéis do PostgreSQL (P0)

| Papel | Uso | Propriedades |
| --- | --- | --- |
| `energymatrix` | migrations, seed | superuser (dono do schema) |
| `energymatrix_app` | backend em runtime | `NOSUPERUSER NOBYPASSRLS NOCREATEDB` |

- `DATABASE_URL` → papel da aplicação (backend).
- `DATABASE_ADMIN_URL` → papel de administração (migrate/seed apenas).
- No dev local sem `DATABASE_ADMIN_URL`, os dois caminhos usam a mesma URL.
- Compose: `docker-compose.yml` define as duas URLs separadamente.

## 4. JWT / refresh token

- Access token: HS256, TTL 15 min (`JWT_ACCESS_TTL_MIN`).
- Refresh token: valor opaco (48 bytes, base64url) — persistido **apenas**
  como hash SHA-256; rotacionado a cada refresh (o antigo é revogado no mesmo
  movimento); revogado no logout; `revokeAllForUser` em troca de senha e em
  desativação de usuário.
- Reuso de refresh revogado → `TOKEN_INVALID` (detecção de roubo de token).
- Coberto pelo teste `refresh rotaciona o token e o antigo deixa de valer`.

## 5. Senhas

- `scrypt` (N=16384, salt de 16 bytes por usuário, 64 bytes de saída),
  comparação com `timingSafeEqual`.
- Nunca em texto claro, nunca retornadas (nem o hash) pela API.
- Mensagem de erro de login sempre genérica (`Credenciais invalidas`).
- Mínimo de 8 caracteres na troca de senha e no convite.
- Custo do scrypt é fixo no código (não configurável por ambiente — P2).


## 6. RBAC (backend, não só frontend)

| Recurso | ADMIN | MACHINE_EVALUATOR | ACCOUNTING |
| --- | --- | --- | --- |
| `/users`, `/invites`, `/security`, `/admin` | ✔ | ✖ | ✖ |
| `/relationships`, `/impacts/analyze` | ✔ | ✔ | ✖ |
| `/economy*` | ✔ | ✖ | ✔ |
| demais (dashboard, máquinas, alertas, eventos, relatórios) | ✔ | ✔ | ✔ |

Não existe role `VIEWER` no modelo atual (papéis: ADMIN, ACCOUNTING,
MACHINE_EVALUATOR). A matriz completa exibida na tela está em
`backend/src/application/services/security.service.ts` (`PERMISSIONS`).

## 7. Rate limiting (seção 11.1)

| Categoria | Rota(s) | Janela | Limite (env) | Resposta |
| --- | --- | --- | --- | --- |
| AUTH | `POST /auth/login`, `/auth/invites/accept` | 60 s | `EMS_RATE_LIMIT_AUTH_MAX` (10) | 429 + `Retry-After` |
| API GERAL | todas as rotas autenticadas | 60 s | `EMS_RATE_LIMIT_API_MAX` (300) | 429 + `Retry-After` |
| TELEMETRIA | `POST /telemetry` | 10 s | `EMS_RATE_LIMIT_TELEMETRY_MAX` (120) | 429 + `Retry-After` |
| ADMIN | `/admin`, `/security`, `/users`, `/invites` | 60 s | `EMS_RATE_LIMIT_ADMIN_MAX` (120) | 429 + `Retry-After` |

- Contagem em **memória por IP** (janela deslizante simples) — suficiente para
  um piloto single-node. Para escala multi-node, mover para Redis (pendência).
- Corpo do erro: `{ "error": { "code": "RATE_LIMITED", "message": ... } } }`.
- Teste: `rate limit AUTH: login excedido devolve 429 com Retry-After`.

## 8. Headers de segurança

Ordem no Express: `requestId → securityHeaders → cors → helmet → json → logger`.

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: same-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- **Produção (`NODE_ENV=production`)**: `Content-Security-Policy` estrito e
  `Strict-Transport-Security` (max-age 1 ano + includeSubDomains + preload).
- Helmet (demais headers de browser hardening) sempre ativo.
- CSP/HSTS **não** aplicados fora de produção para não quebrar o dev server do
  Vite (inline styles) — decisão deliberada e documentada aqui.

## 9. Auditoria

Ações sensíveis gravadas em `audit_logs` (sem RLS de propósito — obrigação de
auditoria; a listagem é restrita a ADMIN):

`auth.login`, `auth.login_failed`, `auth.logout`, `invite.created`,
`invite.accepted`, `user.role_changed`, `user.status_changed`,
`user.password_changed` + ações de negócio (máquinas, alertas etc.).

Campos: `tenant_id`, `user_id`, `action`, `resource`, `resource_id`,
`metadata`, `created_at`. **Nunca** senha, token ou hash.

## 10. CORS e segredos

- `CORS_ORIGIN` (default `*` **apenas em demonstração**). Em produção, listar
  as origens do frontend separadas por vírgula.
- Headers expostos: `X-Total-Count`, `X-Request-Id`.
- `JWT_*_SECRET` sem fallback em produção (o processo **não sobe** sem eles).
- Senhas do seed vêm do ambiente (`SEED_*`); hashes gerados na execução.
- Nenhum segredo no Git; logs nunca registram senha, token ou `DATABASE_URL`.

## 11. Pendências de segurança

| Item | Status |
| --- | --- |
| Prova Postgres+RLS das funções 005 neste ambiente | **P0** (exige Docker/Postgres; não executável aqui) |
| Rate limit distribuído (Redis) | P2 |
| Ajustar `connect-src` da CSP ao backend real em produção | P2 |
| Segredo JWT externo (KMS) | Future |
| MFA / SSO | Future (fora do escopo desta fase) |

