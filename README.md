# EnergyMatrix — EMS Industrial (protótipo funcional de decisão energética)

Protótipo **demonstrável de ponta a ponta** do EnergyMatrix: medir → entender →
monetizar → agir → comprovar. React + TypeScript + Vite no frontend e backend
Node.js (ES modules, **sem dependências externas**) servido em `/api`.

> ⚠️ **Protótipo de demonstração.** A telemetria, o custo e a economia são
> **simulados** e rotulados como *estimativa* / *cenário simulado*. Não
> representam medição industrial real e não controlam máquinas.

## Como rodar

```bash
npm install          # instala as dependências
npm run dev          # Vite dev server (frontend) + backend embutido em /api
```

Abra a URL exibida pelo Vite (por padrão `http://localhost:8443`).
O backend é servido pelo próprio Vite em `/api/*` (plugin
`server/vite-plugin.mjs`) — não é preciso subir outro processo.

### Backend isolado (opcional)

```bash
npm run server                          # http://localhost:8787/api
# aponte o frontend para ele:
VITE_EMS_API_URL=http://localhost:8787 npm run dev
```

### Testes do backend

```bash
node server/smoke.mjs     # 32 verificações das rotas (inclui Competition Mode e protocolos)
```

### Build de produção

```bash
npm run build && npm run preview
```

## Módulos do protótipo

| Módulo | O que mostra |
| --- | --- |
| **Visão da Fábrica** | KPIs, curva 24 h, setores, qualidade dos dados e gateway |
| **Máquinas** | Estados OFF / IDLE / RUNNING / ANOMALY, telemetria e detalhe |
| **Alertas** | Ciclo ABERTO → RECONHECIDO → RESOLVIDO com evidências |
| **Protocolos** | Módulo protocolar: protocolo numerado (EMS-AAAA-NNNN), SLA, trilha de auditoria |
| **Economia** | CUSUM, oportunidades e intervenções antes × depois (determinístico) |
| **Competition Mode** | Simulador determinístico de 3 máquinas e 6 cenários (ver abaixo) |
| **Relatórios** | Consumo por turno, custo × meta, exportação CSV e impressão/PDF |
| **Administração** | Cadastro, tarifas ANEEL, turnos, limiares, saúde do gateway e reset do demo |

## Competition Mode — roteiro de demonstração (5 min)

O Competition Mode é um simulador **determinístico** (nenhum `Math.random()` em
valores exibidos) com 3 máquinas virtuais:

| Máquina | Tipo | P_off | P_idle | P_run | Baseline | Temp. |
| --- | --- | --- | --- | --- | --- | --- |
| **M-001** | Compressor | 0,2 kW | 2,0 kW | 8,0 kW | 8,0 kW | 43 °C |
| **M-002** | Injetora | 0,3 kW | 3,0 kW | 12,0 kW | 10,0 kW | 48 °C |
| **M-003** | Prensa | 0,2 kW | 1,5 kW | 6,0 kW | 6,0 kW | 41 °C |

Cenários (aba **Competition Mode**, ou `POST /api/demo/scenario`):

| Cenário | Máquina | O que prova | Como testar |
| --- | --- | --- | --- |
| `NORMAL` | M-001/002/003 | referência estável | ativar e confirmar 0 alertas |
| `IDLE` | M-001 | IDLE + kWh + R$ improdutivos | ativar e aguardar ≥ 5 min (passos) |
| `ANOMALY` | M-002 | desvio sobre baseline (+50%) + alerta | ativar → P ≈ 15 kW, desvio +50% |
| `THERMAL` | M-002 | alerta térmico persistente | ativar e aguardar T ≥ 85 °C |
| `OFFLINE` | M-003 | ausência de telemetria (MISSING) | ativar → M-003 `online=false` |
| `RECOVERY` | M-001 | ANTES × DEPOIS (−30%) | ativar → painel de comparação |
| *reset* | — | reiniciar o cenário | botão **Reiniciar demo** / `POST /api/demo/reset` |

O simulador avança 1 minuto a cada passo; no modo servido pelo Vite, um passo
ocorre automaticamente a cada ciclo de telemetria (5 s). Também é possível
avançar manualmente (**Avançar +1 min** / `POST /api/demo/step`).

Reprodutibilidade: a mesma sequência de cenário + passos produz exatamente os
mesmos números (verificado em `server/smoke.mjs`).

## Estrutura

```
src/
  components/   # Dashboard, MachineryMonitor, Diagnostics, Protocols,
                # Economia, CompetitionMode, Reports, Admin, Header, Logo
  lib/          # cliente da API (api.ts) e tipos (types.ts)
  assets/       # logo_EnergyMatrix.jpeg
server/
  ems.mjs       # domínio: estado, energia, custo, idle, anomalias
  scenario.mjs  # Competition Mode: simulador determinístico
  protocol.mjs  # domínio do módulo protocolar (SLA, ciclo de vida)
  store.mjs     # store em memória (telemetria simulada)
  api.mjs       # roteador REST (/api/*)
  seed.mjs      # dados-semente
  vite-plugin.mjs, index.mjs, smoke.mjs
public/         # favicon.jpeg (logo do site)
```

## Documentos de referência

- `ENERGYMATRIX_Documento_Tecnico_Atualizado_para_IA_Implementacao_2026.pdf`
- `ENERGYMATRIX_Plano_Tecnico_Simulador_Rapido_e_Pos_Aceite_2026.pdf`
- `ENERGYMATRIX_Auditoria_v2_Cenarios_Economicos.pdf`
