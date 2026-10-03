# Banco de dados — modelo e seed

Nesta entrega o **driver ativo é memória** (`EMS_PERSISTENCE=memory`): a
demonstração precisa rodar sem Docker/PostgreSQL disponível. O modelo abaixo é o
que o adapter PostgreSQL vai materializar; as entidades já carregam `tenant_id`
em tudo e os repositories já filtram por tenant, então a troca não altera o
domínio nem a API.

## Tabelas

| Tabela | Campos principais | Observações |
| --- | --- | --- |
| `tenants` | id, name, slug (único), status | `active` \| `suspended` |
| `sites` | id, tenant_id, name, timezone | "plants" na v2 |
| `sectors` | id, tenant_id, site_id, name | tenant_id para isolamento |
| `users` | id, tenant_id, name, email, password_hash, role, status | e-mail **único globalmente** |
| `invites` | id, tenant_id, role, code_hash, expires_at, used_at, created_by, used_by | só o hash é guardado |
| `refresh_tokens` | id, tenant_id, user_id, token_hash, expires_at, revoked_at, ip, user_agent | revogado no logout |
| `machines` | id, tenant_id, site_id, sector_id, gateway_id, code, name, status, nominal_power_kw, p_off_kw, p_run_kw, baseline_kw, location, deleted_at | soft delete; `code` único por tenant |
| `sensors` | id, tenant_id, machine_id, type, identifier, unit, status, configuration | `POWER`, `CURRENT`, `VOLTAGE`, `TEMPERATURE`, `ENERGY`, `OTHER` |
| `gateways` | id, tenant_id, name, identifier, status, protocol, last_seen_at | `MQTT`, `MODBUS`, `OPCUA` |
| `telemetry` | tenant_id, machine_id, sensor_id, ts, power_kw, energy_kwh, voltage_v, current_a, power_factor, temperature_c, state, quality, source | **PK (machine_id, ts)**; índice (tenant_id, machine_id, ts) |
| `machine_states` | tenant_id, machine_id, started_at, ended_at, state | `ended_at` nulo = vigente |
| `machine_events` | id, tenant_id, machine_id, type, severity, timestamp, metadata, created_at | com `metadata` jsonb de evidência |
| `machine_relationships` | id, tenant_id, source_machine_id, target_machine_id, relationship_type, dependency_level, active | único por (source, target, type) |
| `alerts` | id, tenant_id, machine_id, type, severity, status, message, evidence, created_at, resolved_at | `OPEN` \| `ACKNOWLEDGED` \| `RESOLVED` |
| `alert_events` | id, alert_id, from_status, to_status, actor_id, note, created_at | histórico do ciclo |
| `interventions` | id, tenant_id, machine_id, alert_id, description, responsible_user_id, status, started_at, completed_at, before_after | `before_after` jsonb |
| `tariffs` | id, tenant_id, name, price_per_kwh, active | uma tarifa ativa por tenant |
| `impact_analyses` | id, tenant_id, trigger_event_id, machine_id, window_start, window_end, avoidable_kwh, estimated_cost, classification, evidence, alert_id | registro rastreável da cascata |
| `production_records` | id, tenant_id, machine_id, period_start, period_end, units | normaliza o antes × depois |
| `scenarios` | id, tenant_id, name, status, current_step, started_at | definições vivem em código |
| `audit_logs` | id, tenant_id, user_id, action, resource, resource_id, metadata, ip, user_agent, created_at | **sem FK para não travar listagens** |

Regras gerais: chave primária, foreign keys, constraints e `created_at`/
`updated_at` em todas as tabelas; soft delete (`deleted_at`) onde faz sentido;
valores monetários em `numeric`, telemetria em `double precision`; status e
qualidade como enums; `metadata`/`evidence`/`before_after` em `jsonb`.

## Seed determinístico

`backend/src/database/seeds/seed-data.ts` — sem aleatoriedade, UUIDs fixos,
idempotente:

| Grupo | Conteúdo |
| --- | --- |
| Tenants | `EnergyMatrix Demo Ltda` (A) e `Empresa B Indústria` (B) |
| Usuários | ADMIN, ACCOUNTING e MACHINE_EVALUATOR do Tenant A + ADMIN do Tenant B |
| Fábrica | 10 máquinas (INJ, COMP, PRENSA, CNC…) com P_off/P_run, baseline e temperatura |
| Demo | M-001 Compressor, M-002 Injetora, M-003 Prensa (seção 10.2) |
| Tenant B | 1 máquina mínima (`B-001`), isolada — existe só para o teste de isolamento |
| Relações | M-001 → M-002 → M-003 (SUPPLIES) + COMP-01 → INJ-01 / PRENSA-01 |
| Alertas, protocolos, intervenções | históricos do protótipo, agora com `tenantId` |
| Tarifa | valor padrão **rotulado como estimativa** (editável em Admin) |

Credenciais vêm **do ambiente** (`SEED_ADMIN_PASSWORD` etc.) e são hasheadas no
momento do carregamento. Nenhuma senha real no Git.

## Migrações

Todas as alterações estruturais passam por migrations versionadas (Prisma
Migrate); nada de alteração manual. Caminho obrigatório: banco vazio → migrate →
seed → sistema funcional. Hypertable TimescaleDB, índices parciais e agregados
contínuos entram como migrations futuras — o projeto funciona sem a extensão.