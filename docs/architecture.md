# Arquitetura — EnergyMatrix EMS

Monólito modular em camadas. Cada camada depende apenas da anterior; o domínio
não conhece HTTP, banco, framework ou SDK.

## Camadas

| Camada | Pasta | Responsabilidade | Pode depender de |
| --- | --- | --- | --- |
| Domínio | `backend/src/domain` | entidades, value-objects, regras puras, ports | nada externo |
| Aplicação | `backend/src/application` | casos de uso e orquestração de ports | domínio |
| Apresentação | `backend/src/presentation` | HTTP: rotas, controllers, schemas, middleware | aplicação |
| Infraestrutura | `backend/src/infrastructure` | logger, clock, scheduler, fontes | domínio |
| Banco | `backend/src/database` | seed + adapters dos ports | domínio |
| Composição | `backend/src/bootstrap/container.ts` | único lugar que escolhe implementações | todas |

### Inversão de dependência

O domínio declara **ports** (`IMachineRepository`, `IUserRepository`,
`ITelemetryRepository`, `IImpactAnalysisRepository`, …) e conhece apenas essas
interfaces. Os adapters em memória (`database/repositories/memory`) implementam
as mesmas interfaces. Trocar por PostgreSQL, MQTT ou TimescaleDB é substituir o
adapter — **sem tocar em domínio, analytics ou aplicação**.

## Pipeline único de ingestão

```
fonte (simulador | HTTP | MQTT)
      ↓ contrato de telemetria
IngestionPipeline
      validar → resolver máquina → deduplicar → persistir
      → analytics (state engine, qualidade) → alertas
      (tudo na MESMA transação)
```

REST (`POST /api/telemetry`), MQTT e o simulador terminam no **mesmo**
`IngestionService`. Integridade "parcialmente concluída" não existe: ou o passo
todo grava, ou nada é confirmado.

## Máquina de estados

`MachineState` = estado de **energia** sobreposto por três estados de prioridade:

```
MAINTENANCE > OFFLINE > ANOMALY > (STOPPED | IDLE | RUNNING)
```

- **Estado de energia**: limiar (`p_off`, `p_run`) + histerese de 0,15 kW +
  duração mínima — evita oscilação.
- **ANOMALY**: desvio sobre a baseline, corrente ou temperatura crítica.
- **OFFLINE**: watchdog periódico (P2 minutos sem telemetria não-MISSING).
- `machine_states` guarda os **intervalos** do estado de energia (base do cálculo
  de IDLE); `machine_events` guarda as transições.

"Zero ≠ ausência": máquina desligada reporta `0 kW` com qualidade `GOOD`;
ausência de mensagem vira `MISSING` com campos nulos.

## Relações entre máquinas (D1)

Convenção `source → target`. Sete tipos, com direção de impacto declarada em
`RELATIONSHIP_IMPACT`:

| Tipo | Propaga impacto | Direção |
| --- | --- | --- |
| `SUPPLIES`, `FEEDS` | sim | source → target |
| `DEPENDS_ON`, `FOLLOWS` | sim | target → source |
| `COUPLED`, `PARALLEL`, `BACKUP` | não | — |

Validações obrigatórias na criação: sem auto-relação, único por
`(source, target, type)`, as duas pontas no mesmo tenant e **sem ciclos**
(travessia do grafo com conjunto de visitados).

## Análise de impacto (D2 / D21)

1. Uma máquina entra em `STOPPED`.
2. Percorre-se o grafo para baixo apenas pelas relações que propagam impacto.
3. Máquinas a jusante em `IDLE` acima da janela mínima P1 entram no cálculo.
4. Energia evitável = `∫(potência − P_OFF)dt`; custo = energia × tarifa ativa.
5. Grava-se em `impact_analyses` com **evidência** (janela, potência, tarifa,
   proveniência) e, acima do limite, abre alerta de "possível desperdício".

A classificação do resultado é sempre explícita:

| Classificação | Quando | Rótulo na interface |
| --- | --- | --- |
| `OBSERVED` | variação medida com dados `REAL` | "variação observada" |
| `ESTIMATED` | cálculo por tarifa e premissas | "estimativa" |
| `SIMULATED` | telemetria `source = SIMULATED` | "cenário simulado" |

O sistema **mostra evidência**; nunca afirma causa nem falha física.

## Determinismo

- `Clock` injetável: nenhuma engine chama `Date.now()`.
- Ruído do simulador vem de `dnoise(passo, semente)` — zero `Math.random()`
  em valores exibidos ou persistidos.
- Cenários reiniciáveis: mesma sequência ⇒ mesmos números.

## Evolução sem reescrita

O próximo passo da plataforma (mediadores reais, Modbus, TLS, TimescaleDB)
entra **nessa** arquitetura: novos adapters de fonte (TelemetrySink), novos
adapters de repository e migrations. O núcleo — domínio, analytics, decisões e
regras de economia — permanece igual.