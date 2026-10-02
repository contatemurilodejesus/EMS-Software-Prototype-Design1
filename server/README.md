# EnergyMatrix EMS — Backend

Backend funcional (Node nativo, **sem dependências externas**) que alimenta o
protótipo EMS Industrial: energia, estado de máquina, custo e diagnóstico.

## Como é servido

Há dois modos equivalentes (mesmo roteador em `server/api.mjs`):

1. **Embutido no Vite** (padrão) — o plugin `server/vite-plugin.mjs` registra o
   middleware `/api/*` no próprio Vite. Funciona em `npm run dev` e `npm run preview`
   sem subir outro processo. É o modo usado no Figma Make.
2. **Standalone** — `npm run server` sobe um `http.Server` na porta `EMS_API_PORT`
   (padrão **8787**). Útil para Docker/CI/produção. Para o frontend consumi-lo,
   defina `VITE_EMS_API_URL=http://localhost:8787`.

Se a API estiver indisponível, o frontend usa automaticamente os dados de
demonstração (fallback) — o indicador no cabeçalho mostra `Backend online/offline`.

## Domínio (server/ems.mjs)

- **Estados**: `OFF` (P ≤ P_off), `IDLE` (P_off < P < P_run), `RUNNING` (P ≥ P_run),
  `ANOMALY` (qualquer anomalia crítica).
- **Anomalias**: temperatura > 85 °C, FP < 0,85, sobrecorrente (> 1,3× nominal) e
  variação de tensão (±5 % de 380 V).
- **Custo**: tarifa horária ANEEL (ponta / intermediário / fora de ponta) + custo de IDLE.
- **Telemetria**: o store simula ruído de sensores, consumo acumulado e IDLE crescente
  a cada 5 s (MQTT → store).

## Competition Mode (server/scenario.mjs)

Simulador **determinístico** (sem `Math.random()` em valores exibidos) com 3 máquinas
(M-001 Compressor, M-002 Injetora, M-003 Prensa) e 6 cenários — `NORMAL`, `IDLE`,
`ANOMALY`, `THERMAL`, `OFFLINE`, `RECOVERY`. Cada passo representa 1 minuto simulado
e a telemetria é função pura de `(cenário, passo, máquina)`, garantindo
reprodutibilidade. O cenário é reiniciável (`/api/demo/reset`).

## Módulo protocolar (server/protocol.mjs)

Cada anomalia pode gerar um **protocolo numerado** (`EMS-AAAA-NNNN`) com ciclo de vida
(`open → in_progress → pending_validation → closed`), SLA por prioridade
(crítica 4 h / alta 24 h / média 72 h / baixa 168 h), responsável, evidências e trilha
de auditoria.

## Rotas REST

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/api/health` | Saúde/uptime/versão da API |
| GET | `/api/plants` | Plantas cadastradas |
| GET | `/api/summary` | KPIs, setores, curva 24h, qualidade, gateways |
| GET | `/api/dashboard` | KPIs prontos para o dashboard (Competition Mode) |
| GET | `/api/sectors` | Agregação por setor |
| GET | `/api/analytics/idle` | Energia/custo improdutivo (IDLE) |
| GET | `/api/analytics/anomalies` | Anomalias detectadas + evidência |
| GET | `/api/analytics/cost` | Custo estimado (kWh × tarifa) |
| GET | `/api/machines` | Lista de máquinas (`?state=`, `?sector=`) |
| GET | `/api/machines/:id` | Detalhe + curva de carga |
| GET | `/api/machines/:id/telemetry` | Série de telemetria (determinística no demo) |
| GET | `/api/machines/:id/analytics` | Desvio/anomalias da máquina |
| POST | `/api/machines` | Cadastra máquina |
| PATCH | `/api/machines/:id` | Atualiza limiares (P_off, P_run, nominal…) |
| DELETE | `/api/machines/:id` | Remove máquina |
| GET | `/api/alerts` | Alertas (`?severity=`, `?status=`) |
| GET | `/api/alerts/summary` | Contagens por severidade/status |
| POST | `/api/alerts/:id/advance` | Avança ciclo: open → acknowledged → resolved |
| GET | `/api/economy` | CUSUM, oportunidades e intervenções |
| GET/POST | `/api/economy/interventions` | Lista / registra intervenção (antes × depois) |
| GET/POST | `/api/interventions` | Intervenções do Competition Mode |
| GET | `/api/reports` | Séries de turno, custo, breakdown e tarifas |
| GET | `/api/admin` | Cadastro, tarifas, turnos, saúde do gateway, limiares |
| GET/PATCH | `/api/admin/tariffs` | Lê/atualiza tarifas ANEEL |
| GET/PATCH | `/api/admin/thresholds` | Lê/atualiza limiares de diagnóstico |
| POST | `/api/admin/shifts/:id/toggle` | Liga/desliga turno |
| GET | `/api/competition` | Estado do Competition Mode (KPIs, máquinas, analytics) |
| GET | `/api/competition/dashboard` | Dashboard do demo |
| GET | `/api/competition/machines` | As 3 máquinas simuladas |
| GET | `/api/competition/machines/:id` | Máquina do demo (estado/desvio/anomalia) |
| GET | `/api/competition/machines/:id/telemetry` | Telemetria da máquina do demo |
| GET | `/api/competition/analytics` | Analytics determinístico do demo |
| GET | `/api/demo/status` | Cenário ativo, passo e KPIs |
| POST | `/api/demo/scenario` | Ativa cenário (`{ "scenario": "IDLE" }`) |
| POST | `/api/demo/reset` | Reinicia o demo (cenário NORMAL, passo 0) |
| POST | `/api/demo/step` | Avança 1 minuto simulado |
| GET | `/api/protocols` | Protocolos (`?status=`, `?priority=`, `?sla=`) |
| GET | `/api/protocols/summary` | Contagens por status/SLA |
| POST | `/api/protocols` | Abre protocolo numerado |
| GET | `/api/protocols/:id` | Detalhe + trilha de auditoria |
| POST | `/api/protocols/:id/advance` | Avança o ciclo de vida |
| POST | `/api/protocols/:id/events` | Registra evento (evidência/validação/comentário) |
| POST | `/api/sim/tick` | Força um passo de telemetria |

## Validação

```bash
node server/smoke.mjs   # 32 verificações das rotas (inclui Competition Mode e protocolos)
npm run server          # sobe o backend standalone em :8787
```
