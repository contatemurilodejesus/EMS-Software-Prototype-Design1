# Backend — API, autenticação e regras

## Formato de erro (único)

```json
{ "error": { "code": "MACHINE_NOT_FOUND", "message": "Máquina X não encontrada" } }
```

`400` validação · `401` não autenticado · `403` sem permissão ·
`404` não encontrado (inclusive recurso de outro tenant) · `409` conflito ·
`422` regra de negócio · `429` rate limit · `500` erro interno.

## Autenticação

| Endpoint | Quem pode | O que faz |
| --- | --- | --- |
| `POST /api/auth/login` | público | e-mail + senha → access token curto + refresh token |
| `POST /api/auth/refresh` | público | rotaciona o refresh e devolve novo access |
| `POST /api/auth/logout` | público | revoga o refresh informado |
| `POST /api/auth/invites/accept` | público | cria a conta com código de convite de uso único |
| `GET /api/auth/me` | autenticado | identidade e tenant do token |
| `POST /api/auth/password` | autenticado | troca a própria senha (revoga as sessões) |

- Access token: JWT HS256, expiração curta (`JWT_ACCESS_TTL_MIN`).
- Refresh token: valor **opaco**, guardado apenas como hash SHA-256, revogado no
  logout e rotacionado a cada refresh (reuso é rejeitado).
- Senhas: `scrypt` com salt por usuário. O documento pedia argon2/bcrypt; a
  substituição por `scrypt` (embutido no Node, sem dependência nativa) está
  justificada em `shared/security/index.ts`.
- Mensagem de login **sempre genérica**: nunca revela se o e-mail existe.
- Convite: código de uso único com validade (`INVITE_TTL_HOURS`), guardado só
  como hash; o código puro aparece uma única vez, na resposta.

## Isolamento entre tenants

1. O `tenantId` vem **das claims do token**, publicado em `AsyncLocalStorage`
   (`shared/tenant-context.ts`). Nunca de body, query ou header.
2. Todo método de repository filtra por tenant; consulta por id usa
   `(id, tenantId)`.
3. Recurso de outro tenant responde **404**, nunca 403 — não revela existência.
4. Jobs em segundo plano (watchdog, simulador) rodam com `runWithActor` e
   tenant explícito.
5. O teste obrigatório está em `backend/tests/api.test.ts`.

## RBAC (D13)

| Role | Módulos |
| --- | --- |
| `ADMIN` | tudo, inclusive `/api/security`, usuários e convites |
| `ACCOUNTING` | dashboard, economia, intervenções, relatórios |
| `MACHINE_EVALUATOR` | dashboard, máquinas, alertas, eventos, impacto, protocolos, relatórios |

O menu do frontend esconde o que o role não pode ver, mas **o backend decide**:
a rota está protegida independentemente da interface.

## API — referência rápida

### Fábrica e analytics
`GET /api/plants` · `/api/summary` · `/api/sectors` · `/api/dashboard` ·
`/api/analytics` · `/api/analytics/:key` · `/api/reports`

### Máquinas
`GET|POST /api/machines` · `GET|PATCH|DELETE /api/machines/:id` ·
`GET /api/machines/:id/telemetry` · `/analytics` · `/context` ·
`/events` · `/impacts` · `GET /api/machines/network`

### Relações (D1)
`GET|POST /api/relationships` · `PATCH|DELETE /api/relationships/:id`
Rejeita auto-relação (400), duplicidade (409) e ciclo (409).

### Eventos e impacto
`GET /api/events` · `GET /api/impacts` · `GET /api/impacts/:id` ·
`POST /api/impacts/analyze`

### Alertas, protocolos e economia
`GET /api/alerts` · `/summary` · `POST /api/alerts/:id/advance` ·
`GET|POST /api/protocols` · `POST /api/protocols/:id/advance` ·
`GET /api/economy` · `GET|POST /api/economy/interventions`

### Telemetria
`POST /api/telemetry` — JWT com permissão de escrita; corpo `{ readings: [...] }`.
Deduplicação por `(machine_id, ts)`; o tenant vem do token, **nunca** do payload.

### Demo (determinístico)
`GET /api/demo/status` · `POST /api/demo/scenario` · `/step` · `/reset` ·
`GET /api/competition*`

### Administração e segurança (ADMIN)
`GET /api/admin` · `PATCH /api/admin/tariffs` · `/thresholds` ·
`POST /api/admin/shifts/:id/toggle` · `GET /api/users` ·
`PATCH /api/users/:id/role` · `/status` · `GET|POST /api/invites` ·
`GET /api/security` · `GET /api/security/audit-logs`

## Limitações assumidas

- **Persistência em memória** nesta fase: o driver `postgres` está preparado
  (`EMS_PERSISTENCE`) mas o adapter PostgreSQL é a próxima entrega; a demo roda
  sem Docker por isso. Sem transação real, `unitOfWork` é pass-through.
- **MQTT** entra como novo `TelemetrySink` — o tópico previsto é
  `energy/{tenantId}/machines/{machineId}/telemetry`, com ACL por tenant.
- **TLS** no Mosquitto e **TimescaleDB** ficam para a fase de piloto.
- O watchdog de OFFLINE roda sob demanda (`container.watchdog.run()`); o
  agendamento periódico é o próximo passo junto com o broker real.