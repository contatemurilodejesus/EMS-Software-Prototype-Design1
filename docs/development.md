# Desenvolvimento — comandos, testes e troubleshooting

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm install` | instala as dependências |
| `npm run dev` | Vite (frontend) + backend embutido em `/api` |
| `npm run server` | backend standalone em `:8787` |
| `npm run build` | build estático de produção |
| `npm run preview` | serve o build |
| `npm run smoke` | 32 verificações do Competition Mode (`server/smoke.mjs`) |
| `node --test backend/tests/api.test.ts` | 43 testes da API real, RBAC e isolamento |
| `npx tsc --noEmit -p backend` | tipagem do backend |
| `npx tsc --noEmit` | tipagem do frontend |

> **Não rode `oxfmt`** neste repositório: a versão `0.2.0` corrompe TypeScript.
> Use `tsc --noEmit` para validar.

## Ambiente

Copie `.env.example` para `.env`. Nada é obrigatório para a demonstração: sem
`.env`, o backend sobe com defaults locais e o seed cria as contas padrão.
Ver `.env.example` para a lista completa (segredos, expirações, limiares P1/P2/P5/P6,
credenciais do seed).

Variáveis que mudam comportamento:

| Variável | Efeito |
| --- | --- |
| `EMS_LIVE` | liga/desliga a telemetria simulada contínua |
| `EMS_PERSISTENCE` | `memory` (demo) \| `postgres` (produção) |
| `DEMO_MODE` | habilita `/api/demo/*` e o simulador |
| `OFFLINE_TIMEOUT_MIN` | P2 — minutos sem telemetria até OFFLINE |
| `IMPACT_MIN_WINDOW_MIN` | P1 — janela mínima de IDLE a jusante |
| `JWT_ACCESS_TTL_MIN` / `JWT_REFRESH_TTL_DAYS` | expirações do par de tokens |

## Testes obrigatórios e onde estão

| Verificação | Onde |
| --- | --- |
| Autenticação, refresh, logout, rate limit | `backend/tests/api.test.ts` |
| RBAC (`/api/security` só ADMIN) | idem |
| **Isolamento entre tenants (404 nos dois sentidos)** | idem |
| Convite de uso único (código não reutilizável) | idem |
| Relações: auto-relação, duplicidade, ciclo, tenant | idem |
| Análise de impacto com evidência e classificação | idem |
| Telemetria: ingestão, deduplicação, tenant | idem |
| Estados, cenários, reprodutibilidade, reset | idem + `server/smoke.mjs` |

## Checklist de demonstração

1. `npm run dev` e abrir a URL do Vite.
2. Entrar com `admin@energymatrix.demo` / `demo-admin-2026`.
3. Aba **Competition Mode** → ativar `CASCADE_IDLE` → avançar passos.
4. Conferir eventos (`/api/events`) e a análise de impacto
   (`POST /api/impacts/analyze` com `M-001`), com alerta de possível desperdício.
5. Trocar o id na URL (`/api/machines/B-001`) e mostrar o **404**: é o Tenant B.
6. Entrar como `avaliador@energymatrix.demo` e mostrar o menu sem Economia/Admin.

## Troubleshooting

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| `401` em tudo | sessão expirada | faça login de novo; o refresh é automático quando válido |
| `Credenciais invalidas` | e-mail/senha fora do `.env` | confira `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` |
| `429` no login | rate limit (10/min por IP) | aguarde 60 s |
| `404` em recurso que existe | é de outro tenant | comportamento correto de isolamento |
| Backend sobe sem token em produção | `JWT_ACCESS_SECRET` ausente | defina os segredos — sem fallback em `NODE_ENV=production` |
| Telemetria parada | `EMS_LIVE=false` | religue ou use `POST /api/sim/tick` |
| Cenário não avança | passo manual | `POST /api/demo/step` |
| Frontend mostra fallback local | API fora do ar | o Vite serve `/api`; para backend externo use `VITE_EMS_API_URL` |