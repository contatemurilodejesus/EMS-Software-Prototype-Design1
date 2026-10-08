# EnergyMatrix — Operações

Guia operacional do piloto: health checks, graceful shutdown, backup/restore e
troubleshooting. Sem afirmação de alta disponibilidade — **não existe HA
neste MVP** (nó único; isso é documentado, não vendido).

## 1. Health checks

| Endpoint | O que responde | Uso |
| --- | --- | --- |
| `GET /api/health/live` | processo vivo (sem consultar dependências) | liveness do orquestrador |
| `GET /api/health/ready` | `ready` só se a aplicação **e** o banco responderem | readiness / roteamento |
| `GET /api/health` | contrato completo do frontend (uptime, versão, contadores) | indicador de UI |
| `GET /api/health/database` | `SELECT 1` no pool | diagnóstico do banco |
| `GET /api/health/mqtt` | estado **real** do client: `disabled` \| `ok` \| `unavailable` | diagnóstico do broker |

Regras:

- Readiness **nunca** retorna `200 ready` com banco indisponível: devolve
  **HTTP 503** com `status: degraded` (o orquestrador tira o nó do roteamento).
- MQTT `unavailable` quando o broker está inacessível; `disabled` quando
  `EMS_MQTT_ENABLED=false`. Nunca "healthy" falso.
- Healthcheck do container (compose) bate em `/api/health`.

## 2. Graceful shutdown (SIGTERM/SIGINT)

Sequência implementada em `backend/src/server/shutdown.ts` +
`Container.stop()`:

```
sinal recebido
 ↓ server.close()            → para de aceitar novas conexões, espera as atuais
 ↓ scheduler.stop()          → para o simulador/agendador
 ↓ watchdogScheduler.stop()  → para o sweep de OFFLINE
 ↓ mqttSource.stop()         → desconecta o broker (end(true))
 ↓ pool.close()              → fecha conexões do PostgreSQL (await)
 ↓ exit(0)                   (ou exit(1) se estourar o timeout de 10s)
```

- Timeout de 10s (`shutdown_timeout` no log) evita processo zumbi.
- `closeResources` é **assíncrono**: o handler aguarda o pool fechar antes de
  sair — sem conexão órfã.
- Compose: `restart: unless-stopped` nos serviços.

## 3. Backup e restore (PostgreSQL)

Scripts: `scripts/backup.sh` e `scripts/restore.sh` (executam no host com
`pg_dump`/`pg_restore` ou via container).

### Níveis de serviço declarados (MVP)

| Métrica | Valor | Justificativa |
| --- | --- | --- |
| **RPO** (perda máxima aceitável) | 24 h (diário) | backup `pg_dump` diário agendado |
| **RTO** (restauração) | ≤ 1 h | dump com formato custom + restore único |
| **HA** | **não existe** | nó único; failover manual |

### Backup (diário)

```bash
# Host com pg_dump (ex.: via container do Postgres)
docker compose exec -T postgres pg_dump -U energymatrix -d energymatrix -Fc \
  > backups/energymatrix_$(date +%Y%m%d).dump
```

Retenção sugerida: 7 dias diários + 4 semanais (política local do host).

### Restore

```bash
docker compose stop backend           # para de gravar
docker compose exec -T postgres pg_restore -U energymatrix -d energymatrix \
  --clean --if-exists < backups/energymatrix_YYYYMMDD.dump
docker compose start backend
```

### Verificação pós-restore

```bash
curl -s localhost:8787/api/health/ready   # status ready
curl -s localhost:8787/api/health/database
```

A restauração **não** é automática e **não** foi exercitada em pipeline nesta
fase — é rotina manual documentada (pendência P1: agendar e testar restore).

## 4. Migrations e seed

```bash
npm run db:migrate   # idempotente: aplica somente o que falta (schema_migrations)
npm run db:seed      # idempotente (upsert); NÃO apaga dados
```

- Migrações rodam com `DATABASE_ADMIN_URL` (papel admin); o backend roda com
  `DATABASE_URL` (papel comum).
- Lock advisory (`pg_advisory_lock`) evita applies concorrentes.
- Falha de migration: transação própria → rollback; nada é aplicado pela metade.

## 5. Comandos de verificação

```bash
npm run typecheck          # tsc frontend + backend
npm test                   # suítes: api + flow + mqtt (55 testes)
npx tsc --noEmit -p backend
node backend/proof/rls.proof.ts    # prova de RLS (exige Postgres ativo)
```

## 6. Troubleshooting

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| `ready` com `degraded` | Postgres fora do ar / credentials erradas | `GET /api/health/database`; checar `DATABASE_URL` |
| Backend não sobe em produção | `JWT_*_SECRET` ausente | definir segredos no ambiente |
| Login 401 com credenciais corretas (Postgres) | migração 005 não aplicada | `npm run db:migrate` |
| 429 inesperado | limite da categoria atingido | ver `Retry-After`; ajustar `EMS_RATE_LIMIT_*` |
| MQTT `unavailable` | broker parado / rede | `docker compose ps mosquitto` |
| `EMS_PERSISTENCE=postgres` falha na partida | banco indisponível em 30 s | subir Postgres antes (compose `depends_on`) |
