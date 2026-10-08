# EnergyMatrix — EMS Industrial (MVP técnico: arquitetura, multi-tenancy e telemetria)

Protótipo **demonstrável de ponta a ponta** do EnergyMatrix: medir → entender →
monetizar → agir → comprovar. Monólito modular em camadas, com **isolamento por
tenant**, autenticação real, telemetria persistente e análise de impacto em cascata.

> ⚠️ **Demonstração com telemetria simulada.** Os valores são rotulados como
> *estimativa* / *cenário simulado* (`OBSERVED` | `ESTIMATED` | `SIMULATED`).
> Não representam medição industrial real e não controlam máquinas.

## Como rodar

```bash
npm install          # instala as dependências
cp .env.example .env # opcional (há defaults seguros para demonstração)
npm run dev          # Vite (frontend) + backend embutido em /api
```

Abra a URL exibida pelo Vite (por padrão `http://localhost:8443`). O backend é
servido pelo próprio Vite em `/api/*` (`server/vite-plugin.mjs`).

### Entrar na demonstração

A API exige autenticação. O seed cria dois tenants e quatro usuários — as
credenciais vêm do ambiente, **nunca do Git**:

| Perfil | E-mail (padrão) | Senha (padrão) | Acesso |
| --- | --- | --- | --- |
| ADMIN | `admin@energymatrix.demo` | `demo-admin-2026` | tudo |
| ACCOUNTING | `financeiro@energymatrix.demo` | `demo-contabil-2026` | economia, intervenções, relatórios |
| MACHINE_EVALUATOR | `avaliador@energymatrix.demo` | `demo-avaliador-2026` | máquinas, alertas, eventos, impacto |
| ADMIN (Tenant B) | `admin@empresa-b.demo` | `demo-empresa-b-2026` | existe **para provar o isolamento** |

Rotas públicas do frontend: `/login`, `/invite` (convite de uso único) e
`/unauthorized`. Tudo o mais exige sessão.

### Backend isolado (opcional)

```bash
npm run server                                     # http://localhost:8787/api
VITE_EMS_API_URL=http://localhost:8787 npm run dev
```

### Testes

```bash
npm test        # 55 testes: API real, RBAC, isolamento A/B, rate limit, telemetria e fluxo completo (api.test.ts, flow.test.ts, mqtt.test.ts)
npm test        # 55 testes: API real, RBAC, isolamento A/B, rate limit, telemetria e fluxo completo (api.test.ts, flow.test.ts, mqtt.test.ts)
# npm run smoke -- (competicao mode: 32 verificacoes antigas, mantem-se como validacao)
npx tsc --noEmit                       # tipagem do frontend
npx tsc --noEmit -p backend            # tipagem do backend
```

Documentacao de producao:

| Documento | O que contem |
| --- | --- |
| `docs/architecture.md` | camadas, isolamento, decisoes de evolucao |
| `docs/backend.md` | API, autenticacao, rate limit e regras |
| `docs/database.md` | modelo, migrations, RLS e papéis (`energymatrix_app`) |
| `docs/security.md` | login+RLS (SECURITY DEFINER), JWT, RBAC, headers, auditoria |
| `docs/operations.md` | health checks, graceful shutdown, backup/restore, troubleshooting |
| `docs/development.md` | comandos, testes e troubleshooting |


O teste de isolamento é obrigatório e está em `backend/tests/api.test.ts`:
o Tenant A **não** consegue ler, alterar ou apagar (`404`) recursos do Tenant B
mesmo trocando ids manualmente na URL.

### Build de produção

```bash
npm run build && npm run preview
```

## Arquitetura

Monólito modular em camadas — cada uma depende apenas da anterior:

```
presentation (routes, controllers, schemas, middleware)
        ↓
application (services, context)
        ↓
domain (entities, value-objects, ports, errors)   ← não depende de nada externo
        ↑
infrastructure / database (repositories, simulador, logger, clock)
        ↑
bootstrap/container.ts  ← único lugar que conhece implementações
```

Regras respeitadas: controller não toca em repository; service não depende de
Express; domínio não conhece tecnologia; `tenant_id` **nunca** vem do cliente.

## Módulos

| Módulo | O que mostra |
| --- | --- |
| **Visão da Fábrica** | KPIs, curva 24 h, setores, qualidade dos dados e gateway |
| **Máquinas** | Estados STOPPED / IDLE / RUNNING / ANOMALY / OFFLINE, telemetria e detalhe |
| **Rede de Máquinas** | Grafo vindo da API (`/api/machines/network`), dependências e impacto |
| **Alertas** | Ciclo ABERTO → RECONHECIDO → RESOLVIDO com evidências |
| **Eventos** | Transições de estado, POWER_HIGH/LOW, TEMPERATURE_HIGH, OFFLINE, RECOVERY |
| **Impacto** | Cascata: energia evitável, custo estimado e alerta de possível desperdício |
| **Protocolos** | Protocolo numerado, SLA derivado e trilha de eventos |
| **Economia** | CUSUM, custo por máquina/setor e intervenções antes × depois |
| **Competition Mode** | Simulador determinístico de 3 máquinas e 7 cenários |
| **Relatórios** | Consumo por turno, custo × meta, exportação CSV |
| **Administração** | Cadastro, tarifas, turnos, limiares, usuários, convites, segurança |

## Multi-tenancy e segurança

- `tenant_id` vem **sempre** das claims do access token, nunca de body/query/header.
- Todo acesso a dado da empresa filtra por `(id, tenantId)`; id de outro tenant
  responde **404** (não revela a existência do registro).
- Senhas: `scrypt` com salt por usuário. Refresh token: valor opaco guardado
  apenas como hash SHA-256, rotacionado a cada refresh e revogado no logout.
- Rate limiting nas tentativas de login e de aceite de convite.
- Audit log por ação, com `tenant_id` — nunca guarda senha nem token.

## Competition Mode — roteiro de demonstração (5 min)

Simulador **determinístico** (nenhum `Math.random()` em valores exibidos):

| Máquina | Tipo | P_off | P_idle | P_run | Baseline | Temp. |
| --- | --- | --- | --- | --- | --- | --- |
| **M-001** | Compressor | 0,2 kW | 2,0 kW | 8,0 kW | 8,0 kW | 43 °C |
| **M-002** | Injetora | 0,3 kW | 3,0 kW | 12,0 kW | 10,0 kW | 48 °C |
| **M-003** | Prensa | 0,2 kW | 1,5 kW | 6,0 kW | 6,0 kW | 41 °C |

Cenários (aba **Competition Mode**, ou `POST /api/demo/scenario`):

| Cenário | Máquina | O que prova |
| --- | --- | --- |
| `NORMAL` | M-001/002/003 | referência estável, sem alerta indevido |
| `IDLE` | M-001 | IDLE + kWh + R$ improdutivos |
| `ANOMALY` | M-002 | desvio sobre a baseline (+50%) + alerta |
| `THERMAL` | M-002 | alerta térmico persistente |
| `OFFLINE` | M-003 | ausência de telemetria (MISSING) + evento OFFLINE |
| `RECOVERY` | M-001 | ANTES × DEPOIS (−30%) |
| `CASCADE_IDLE` | M-001 | M-001 STOPPED, M-002/M-003 IDLE → análise de impacto |
| *reset* | — | reiniciar o cenário (`POST /api/demo/reset`) |

Mesma sequência de cenário + passos ⇒ **exatamente** os mesmos números
(verificado em `backend/tests/api.test.ts` e `server/smoke.mjs`).

## Estrutura

```
src/                          # frontend React + Vite
  components/                 # telas e o gate de sessão (Login/Invite)
  lib/api.ts                  # cliente da API: token, refresh, erros, hooks
backend/src/
  domain/                     # entidades, value-objects, ports, erros
  application/services/       # casos de uso (auth, events, relationships, ...)
  presentation/               # routes, controllers, schemas, middleware
  database/                   # seed determinístico + repositories (memória)
  analytics/                  # engines de estado, custo, idle, anomalia, qualidade
  ingestion/                  # pipeline único de ingestão (HTTP, MQTT, simulador)
  simulator/                  # gerador puro e determinístico dos cenários
  infrastructure/             # logger, clock, scheduler, fonte simulada
  bootstrap/container.ts      # composition root
docs/                         # arquitetura, banco, backend, desenvolvimento
```

## Documentos de referência

- `docs/architecture.md` — camadas, decisões e caminhos de evolução
- `docs/backend.md` — API, autenticação, regras e limitações
- `docs/database.md` — modelo de dados e seed
- `docs/development.md` — comandos, testes e troubleshooting
- `ENERGYMATRIX_Documento_Tecnico_Atualizado_para_IA_Implementacao_2026.pdf`
- `ENERGYMATRIX_Plano_Tecnico_Simulador_Rapido_e_Pos_Aceite_2026.pdf`
- `ENERGYMATRIX_Auditoria_v2_Cenarios_Economicos.pdf`
