# figma-make-app

React + Vite + Tailwind CSS project running inside Figma Make.

## Development Server

A Vite development server is **already running** on `$PORT` (default 8443). You don't need to start it manually.

- Preview URL: The user can access the running app through the preview panel
- Hot reload: Changes to source files are reflected immediately

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

- `src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx` into the `#root` element
- `src/App.tsx` - Primary application component and the usual starting point for UI work
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
- `index.html` - Vite HTML shell containing the `#root` element and loading `src/main.tsx`
- `package.json` - Project dependencies and the Vite build, development, preview, and formatting scripts
- `vite.config.ts` - Vite configuration with React, Tailwind CSS v4, and Figma Make plugins plus the `@` alias for `src`
- `.mise.toml` - Toolchain versions for Node.js and pnpm

## Dependencies

- Runtime: React 19 and React DOM 19
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`
- Formatting: **oxfmt removido** — a versão `0.2.0` corrompe TypeScript (remove o `;`
  entre membros de object type literals e reformata `node_modules`). **Não rode
  `oxfmt`** neste repositório; use `npx tsc --noEmit` para validar e
  `node --test backend/tests/` para os testes do backend.

---

# EnergyMatrix — memória do projeto

## Estado atual (verificado, não presumido)

**Fase 1 — CONSOLIDAÇÃO: CONCLUÍDA E VERIFICADA**
- `server/*.mjs` legado **removido** (api, ems, scenario, protocol, seed, store, index, smoke, README).
- `server/vite-plugin.mjs` reescrito: monta `createContainer` + `createApp` (Express) e encaminha `/api` por socket efêmero. **Uma API só.**
- Scripts: `npm run server` → `node backend/src/server/index.ts`; `npm test` → `node --test backend/tests/`.
- Lixo removido: 12 `tmp_*`, `extracted_doc_clean.txt`, `git_status.txt`, `CLAUDE.md`, `package-lock.json`.
- `scripts/verify-dev-api.mjs`: 9 verificações no dev server → **todas OK** (401 sem token, login A/B, isolamento 404, relações, network, eventos).

**Fase 2 — PERSISTÊNCIA: PARCIAL**
- `backend/src/database/postgres/pool.ts` (pool, `setTenant`, transaction com BEGIN/COMMIT/ROLLBACK, healthCheck).
- Migrations aplicadas no Postgres real: `001_init.sql` (23 tabelas), `002_timescale_optional.sql`, `003_app_role.sql`.
- **TimescaleDB confirmado**: `telemetry` é hypertable (chunks de 7 dias) + retenção 365 dias.
- Seed idempotente OK: 2 tenants, 4 usuários, 14 máquinas, 4 relações.
- `identity.repository.ts` (tenants/users/invites/refresh_tokens) — compila.

**Fase 3 — RLS: PROVADA NO BANCO**
- `backend/tests/rls.proof.ts`: **13 verificações, todas OK**.
- **ACHADO REAL**: o usuário do container (`energymatrix`) é SUPERUSER e ignorava a RLS. A migration 003 cria `energymatrix_app` (NOSUPERUSER NOBYPASSRLS). Com ele a RLS vale de verdade.
- 0 linhas visíveis sem `app.tenant_id`; INSERT com tenant alheio é recusado.

**Testes**: `node --test backend/tests/api.test.ts` → **43/43**. `tsc --noEmit` (backend e frontend) → limpo.

## Comandos atuais

```bash
npm run dev                    # Vite + API oficial (Express) em /api
npm test                       # node --test backend/tests/
npm run typecheck              # tsc --noEmit && tsc --noEmit -p backend
node backend/tests/rls.proof.ts        # prova de RLS (exige DATABASE_URL)
node scripts/verify-dev-api.mjs        # prova do dev server
docker compose up -d postgres
```

## Armadilhas já descobertas (NÃO repetir)

1. **SQL/PLpgSQL: literais adjacentes em linhas separadas NÃO concatenam.** Precisam de `||`.
2. **`COMMENT ON ... IS` exige literal único** — não aceita expressão com `||`.
3. **A porta 5432 do host já é usada** por outro projeto (`healthflow-db`). O compose usa `${EMS_POSTGRES_PORT:-5433}` no host; a rede interna continua 5432.
4. **O `vite-plugin.mjs` roda em `.mjs`**: não aceita TS. Para scripts com tipos, usar extensão `.ts`.
5. **O Node carrega o backend TS nativamente** (type stripping): `import("../backend/src/...")` funciona em runtime.
6. **`node --test <dir>` NÃO faz auto-descoberta de `.ts`.** Use glob explicito: `node --test "backend/tests/*.test.ts"`. Arquivos de prova (nao-teste) ficam em `backend/proof/`, nunca em `backend/tests/`.
7. **A imagem timescale declara volume anonimo em `/docker-entrypoint-initdb.d`**, que mascara bind-mount de arquivo. A solucao adotada: criar o banco de teste no `healthcheck` do compose.
8. **`docker compose down -v` nao remove volume anonimo** que nao esteja declarado no compose.

## Estado do ambiente Docker

- Container: `energymatrix-postgres` (imagem `timescale/timescaledb:latest-pg16`), porta do host **5433** (5432 ocupada por `healthflow-db`).
- Bancos: `energymatrix` e `energymatrix_test`, ambos com migrations + seed aplicados.
- Papel da aplicacao: `energymatrix_app` / senha `energymatrix_app` (sem superusuario). O papel `energymatrix` e reservado a migrate/seed.

## Proximo passo

Completar os repositories Postgres restantes (machines, telemetry, machineStates, alerts, machineEvents, relationships, impactAnalyses, auditLogs, config, plants, protocols, scenarios, reports) e ligar `EMS_PERSISTENCE=postgres` no container.

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `vite.config.ts`. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in `src/index.css`. This scaffold does not need a Tailwind config file or PostCSS config.

`src/main.tsx` imports `src/index.css`, so global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.
