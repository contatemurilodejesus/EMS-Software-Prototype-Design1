/**
 * EnergyMatrix EMS — dados-semente (histórico operacional da Planta SP Guarulhos).
 * Servem de baseline para o store em memória e para o fallback offline do frontend.
 */

export const PLANTS = [
  {
    id: "SP-GRU",
    name: "Planta SP — Guarulhos",
    demandLimitKW: 480,
    timezone: "America/Sao_Paulo",
  },

  {
    id: "RJ-DC",
    name: "Planta RJ — Duque de Caxias",
    demandLimitKW: 360,
    timezone: "America/Sao_Paulo",
  },

  {
    id: "MG-CT",
    name: "Planta MG — Contagem",
    demandLimitKW: 420,
    timezone: "America/Sao_Paulo",
  },
]

export const SECTOR_META = [
  { id: "A", name: "Setor A — Injeção" },

  { id: "B", name: "Setor B — Compressores" },

  { id: "C", name: "Setor C — Prensas" },

  { id: "D", name: "Setor D — CNC / Usinagem" },
]

/** Máquinas monitoradas — espelha o módulo "Máquinas". */

export const MACHINES = [
  {
    id: "INJ-01",
    name: "Injetora Engel 480T",
    type: "Injetora",
    sector: "Setor A",
    gateway: "GW-SP01",
    nominalKW: 35,
    pOff: 2,
    pRun: 12,
    voltage: 381,
    current: 42.3,
    power: 28.4,
    consumption: 312.7,
    temperature: 68,
    powerFactor: 0.92,
    coverage: 98,
    lastUpdate: "14:30",
  },

  {
    id: "INJ-02",
    name: "Injetora Krauss 350T",
    type: "Injetora",
    sector: "Setor A",
    gateway: "GW-SP01",
    nominalKW: 28,
    pOff: 2,
    pRun: 18,
    voltage: 374,
    current: 18.1,
    power: 6.8,
    consumption: 487.2,
    temperature: 52,
    powerFactor: 0.79,
    idleMinutes: 47,
    idleCostDay: 412,
    coverage: 94,
    lastUpdate: "14:31",
  },

  {
    id: "COMP-01",
    name: "Compressor Atlas 75kW",
    type: "Compressor",
    sector: "Setor B",
    gateway: "GW-SP01",
    nominalKW: 75,
    pOff: 3,
    pRun: 15,
    voltage: 383,
    current: 38.7,
    power: 24.9,
    consumption: 287.4,
    temperature: 62,
    powerFactor: 0.94,
    coverage: 99,
    lastUpdate: "14:30",
  },

  {
    id: "COMP-02",
    name: "Compressor Schulz 55kW",
    type: "Compressor",
    sector: "Setor B",
    gateway: "GW-SP01",
    nominalKW: 55,
    pOff: 2,
    pRun: 12,
    voltage: 362,
    current: 78.4,
    power: 51.2,
    consumption: 621.8,
    temperature: 97,
    powerFactor: 0.68,
    coverage: 91,
    lastUpdate: "14:28",
  },

  {
    id: "PRENSA-01",
    name: "Prensa Hidráulica 200T",
    type: "Prensa",
    sector: "Setor C",
    gateway: "GW-SP01",
    nominalKW: 30,
    pOff: 1,
    pRun: 10,
    voltage: 380,
    current: 29.1,
    power: 18.6,
    consumption: 198.3,
    temperature: 55,
    powerFactor: 0.91,
    coverage: 99,
    lastUpdate: "14:32",
  },

  {
    id: "PRENSA-02",
    name: "Prensa Excêntrica 80T",
    type: "Prensa",
    sector: "Setor C",
    gateway: "GW-SP01",
    nominalKW: 15,
    pOff: 1,
    pRun: 10,
    voltage: 376,
    current: 11.4,
    power: 4.2,
    consumption: 356.1,
    temperature: 44,
    powerFactor: 0.82,
    idleMinutes: 23,
    idleCostDay: 280,
    coverage: 99,
    lastUpdate: "14:31",
  },

  {
    id: "CNC-01",
    name: "Torno CNC Romi GL-240",
    type: "CNC",
    sector: "Setor D",
    gateway: "GW-SP02",
    nominalKW: 18,
    pOff: 1,
    pRun: 8,
    voltage: 382,
    current: 22.8,
    power: 14.7,
    consumption: 143.6,
    temperature: 47,
    powerFactor: 0.95,
    coverage: 99,
    lastUpdate: "14:32",
  },

  {
    id: "CNC-02",
    name: "Centro de Usinagem DMG 60",
    type: "CNC",
    sector: "Setor D",
    gateway: "GW-SP02",
    nominalKW: 22,
    pOff: 1,
    pRun: 8,
    voltage: 355,
    current: 91.2,
    power: 57.8,
    consumption: 742.3,
    temperature: 103,
    powerFactor: 0.61,
    coverage: 88,
    lastUpdate: "14:27",
  },

  {
    id: "CNC-03",
    name: "Fresadora CNC Mazak QT",
    type: "CNC",
    sector: "Setor D",
    gateway: "GW-SP02",
    nominalKW: 18,
    pOff: 1,
    pRun: 8,
    voltage: 379,
    current: 9.2,
    power: 3.1,
    consumption: 98.4,
    temperature: 38,
    powerFactor: 0.88,
    idleMinutes: 68,
    idleCostDay: 892,
    coverage: 91,
    lastUpdate: "14:30",
  },

  {
    id: "CNC-04",
    name: "Torno CNC Okuma LB-3000",
    type: "CNC",
    sector: "Setor D",
    gateway: "GW-SP02",
    nominalKW: 18,
    pOff: 1,
    pRun: 8,
    voltage: 0,
    current: 0,
    power: 0,
    consumption: 0,
    temperature: 22,
    powerFactor: 0,
    coverage: 100,
    lastUpdate: "12:00",
  },
]

/** Alertas abertos/históricos — espelha o módulo "Alertas". */

export const ALERTS = [
  {
    id: "ALT-2026-0041",
    machine: "Centro de Usinagem DMG 60",
    machineId: "CNC-02",
    sector: "Setor D",
    anomaly: "Fuga de Corrente",
    anomalyType: "Elétrico",
    condition: "I_fase_A = 91,2 A por ≥ 8 min (P_run = 8 kW, corrente anormal)",
    peakTime: "09:15 – contínuo",
    severity: "critical",
    status: "open",
    action:
      "Desligar equipamento. Medir resistência de isolação (megôhmetro). Verificar cabos de alimentação e aterramento.",
    detectedAt: "30/09/2026 09:15",
  },

  {
    id: "ALT-2026-0040",
    machine: "Compressor Schulz 55kW",
    machineId: "COMP-02",
    sector: "Setor B",
    anomaly: "Sobrecorrente + Temperatura Crítica",
    anomalyType: "Sobrecarga",
    condition:
      "I = 78,4 A (nominal 55 kW / 380V ≈ 102 A, porém T = 97°C > limite 85°C)",
    peakTime: "08:22 – contínuo",
    severity: "critical",
    status: "acknowledged",
    action:
      "Substituir filtro de ar. Verificar pressão do sistema e rolamentos. Checar válvula de alívio.",
    detectedAt: "30/09/2026 08:22",
    acknowledgedAt: "30/09/2026 08:35",
    assignee: "Técnico M. Santos",
  },

  {
    id: "ALT-2026-0039",
    machine: "Injetora Krauss 350T",
    machineId: "INJ-02",
    sector: "Setor A",
    anomaly: "IDLE prolongado (47 min)",
    anomalyType: "Consumo Improdutivo",
    condition:
      "Estado IDLE por ≥ 30 min (P entre P_off=2 kW e P_run=18 kW sem produção registrada)",
    peakTime: "13:45 – contínuo",
    severity: "high",
    status: "open",
    action:
      "Verificar se a máquina pode ser desligada. Operador deve registrar motivo da pausa ou desligar.",
    detectedAt: "30/09/2026 13:45",
    idleCost: "R$ 412/dia estimado",
  },

  {
    id: "ALT-2026-0038",
    machine: "Fresadora CNC Mazak QT",
    machineId: "CNC-03",
    sector: "Setor D",
    anomaly: "IDLE prolongado (68 min)",
    anomalyType: "Consumo Improdutivo",
    condition: "Estado IDLE por ≥ 30 min — maior custo de IDLE da fábrica hoje",
    peakTime: "12:50 – contínuo",
    severity: "high",
    status: "open",
    action:
      "Desligar às 13h se sem previsão de retorno. Registrar a intervenção para comprovação de economia.",
    detectedAt: "30/09/2026 12:50",
    idleCost: "R$ 892/dia estimado",
  },

  {
    id: "ALT-2026-0037",
    machine: "Injetora Krauss 350T",
    machineId: "INJ-02",
    sector: "Setor A",
    anomaly: "Fator de Potência Baixo (FP = 0,79)",
    anomalyType: "Qualidade de Energia",
    condition: "FP_periodo = kWh/√(kWh²+kvarh²) = 0,79 < 0,85 por > 2h",
    peakTime: "11:00 – 13:30",
    severity: "high",
    status: "acknowledged",
    action:
      "Verificar banco de capacitores. Checar contatos (possível aberto). Solicitar analisador de qualidade.",
    detectedAt: "30/09/2026 11:00",
    acknowledgedAt: "30/09/2026 11:20",
    assignee: "Técnico E. Lima",
  },

  {
    id: "ALT-2026-0036",
    machine: "Prensa Excêntrica 80T",
    machineId: "PRENSA-02",
    sector: "Setor C",
    anomaly: "IDLE (23 min) · Variação de Tensão",
    anomalyType: "Misto",
    condition: "IDLE 23 min + V = 376 V (–1,0% nominal) por > 1h",
    peakTime: "13:15 – contínuo",
    severity: "medium",
    status: "acknowledged",
    action:
      "Verificar conexões no quadro QD-C. Medir queda de tensão no ramal de alimentação.",
    detectedAt: "30/09/2026 13:15",
    acknowledgedAt: "30/09/2026 13:40",
    assignee: "Técnico M. Santos",
  },

  {
    id: "ALT-2026-0035",
    machine: "Compressor Atlas 75kW",
    machineId: "COMP-01",
    sector: "Setor B",
    anomaly: "Consumo acima da baseline (+12%)",
    anomalyType: "Eficiência",
    condition:
      "CUSUM: E_medido > E_esperado(produção) por 3 dias consecutivos, z_robusto = 4,1",
    peakTime: "07:00 – 09:00",
    severity: "medium",
    status: "resolved",
    action:
      "Programação de temporização ajustada. Ciclos desnecessários eliminados. Economia estimada: R$ 290/mês.",
    detectedAt: "29/09/2026 07:00",
    acknowledgedAt: "29/09/2026 08:10",
    resolvedAt: "29/09/2026 16:30",
    assignee: "Técnico M. Santos",
  },
]

/** Intervenções monetizadas (antes × depois) — módulo "Economia". */

export const INTERVENTIONS = [
  {
    id: "INT-014",
    date: "22/09",
    machine: "COMP-01",
    desc: "Ajuste temporização",
    before: 621,
    after: 543,
    saved: 78,
    period: "22–30/set",
    confidence: "estimado",
    status: "active",
  },

  {
    id: "INT-013",
    date: "18/09",
    machine: "INJ-01",
    desc: "Troca de resistência de aquecimento",
    before: 498,
    after: 441,
    saved: 57,
    period: "18–30/set",
    confidence: "observado",
    status: "active",
  },

  {
    id: "INT-012",
    date: "10/09",
    machine: "PRENSA-01",
    desc: "Lubrificação + alinhamento",
    before: 312,
    after: 287,
    saved: 25,
    period: "10–30/set",
    confidence: "estimado",
    status: "active",
  },
]

/** Turnos de produção — módulo "Administração". */

export const SHIFTS = [
  { id: "A", label: "Turno A", time: "06:00 – 14:00", active: true },

  { id: "B", label: "Turno B", time: "14:00 – 22:00", active: true },

  { id: "C", label: "Turno C", time: "22:00 – 06:00", active: false },
]

/** Infraestrutura / gateway — módulo "Visão da Fábrica". */

export const GATEWAYS = [
  {
    id: "GW-SP01",
    label: "Gateway SP-01",
    status: "online",
    sub: "MQTT · TLS · 14 sensores",
  },

  {
    id: "GW-SP02",
    label: "Gateway SP-02",
    status: "online",
    sub: "MQTT · TLS · 9 sensores",
  },

  {
    id: "GW-SP03",
    label: "Broker MQTT",
    status: "online",
    sub: "QoS 1 · Latência: 42ms",
  },

  {
    id: "GW-SP04",
    label: "TimescaleDB",
    status: "online",
    sub: "1.2 M leituras hoje",
  },

  {
    id: "GW-SP05",
    label: "Motor analítico",
    status: "warning",
    sub: "Baseline regressão pendente",
  },
]

/** Contadores brutos de qualidade de leitura (7 dias) — Dashboard. */

export const READINGS = { good: 914, missing: 41, outlier: 32, duplicate: 13 }

/** Carga não monitorada (kWh/dia) — iluminação, climatização, escritório. */

export const NON_MONITORED_KWH_DAY = 580

/** Saúde do gateway — módulo "Administração". */

export const GATEWAY_HEALTH = [
  { k: "Última mensagem MQTT", v: "há 2 min", ok: true },

  { k: "Seq. gap detectado", v: "0", ok: true },

  { k: "Leituras MISSING (24h)", v: "4,1%", ok: true },

  { k: "Leituras OUTLIER (24h)", v: "3,2%", ok: true },

  { k: "Timestamp drift", v: "+1,2 s", ok: true },

  { k: "Versão firmware GW", v: "v1.4.2", ok: true },
]

/** Consumo agregado da planta — última 24h + "Agora" (dashboard). */

export const CONSUMPTION_SERIES = [
  { time: "00h", consumo: 312 },
  { time: "01h", consumo: 287 },
  { time: "02h", consumo: 265 },

  { time: "03h", consumo: 251 },
  { time: "04h", consumo: 274 },
  { time: "05h", consumo: 318 },

  { time: "06h", consumo: 402 },
  { time: "07h", consumo: 456 },
  { time: "08h", consumo: 491 },

  { time: "09h", consumo: 510 },
  { time: "10h", consumo: 498 },
  { time: "11h", consumo: 475 },

  { time: "12h", consumo: 388 },
  { time: "13h", consumo: 421 },
  { time: "14h", consumo: 467 },

  { time: "15h", consumo: 502 },
  { time: "16h", consumo: 488 },
  { time: "17h", consumo: 445 },

  { time: "18h", consumo: 391 },
  { time: "19h", consumo: 352 },
  { time: "20h", consumo: 328 },

  { time: "21h", consumo: 305 },
  { time: "22h", consumo: 298 },
  { time: "Agora", consumo: 321 },
]

/** Histórico mensal de consumo por turno — módulo "Relatórios". */

export const SHIFT_DATA = [
  { month: "Abr", turnoA: 142800, turnoB: 128400, turnoC: 87200 },

  { month: "Mai", turnoA: 151200, turnoB: 132100, turnoC: 89400 },

  { month: "Jun", turnoA: 148700, turnoB: 135800, turnoC: 91200 },

  { month: "Jul", turnoA: 155400, turnoB: 139200, turnoC: 93800 },

  { month: "Ago", turnoA: 161200, turnoB: 141700, turnoC: 88900 },

  { month: "Set", turnoA: 157800, turnoB: 138400, turnoC: 90300 },
]

/** Tendência de custo × meta (R$/mês) — módulo "Relatórios". */

export const COST_TREND = [
  { month: "Abr", custo: 89420, meta: 85000 },
  { month: "Mai", custo: 94110, meta: 85000 },

  { month: "Jun", custo: 92380, meta: 88000 },
  { month: "Jul", custo: 97240, meta: 88000 },

  { month: "Ago", custo: 101560, meta: 90000 },
  { month: "Set", custo: 98320, meta: 90000 },
]

/** Top consumidores (kWh/dia) — módulo "Relatórios". */

export const MACHINE_BREAKDOWN = [
  { name: "CNC-02", value: 742, fill: "#BC0202" },

  { name: "COMP-02", value: 622, fill: "#D97706" },

  { name: "INJ-02", value: 487, fill: "#F59E0B" },

  { name: "PRENSA-02", value: 356, fill: "#6B7280" },

  { name: "INJ-01", value: 313, fill: "#9CA3AF" },

  { name: "Outros", value: 408, fill: "#D1D5DB" },
]

/** Perfil tarifário horário (R$/kWh) — módulo "Relatórios". */

export const TARIFF_PROFILE = [
  { h: "00h", r: 0.42 },
  { h: "02h", r: 0.42 },
  { h: "04h", r: 0.42 },

  { h: "06h", r: 0.78 },
  { h: "08h", r: 1.84 },
  { h: "10h", r: 1.84 },

  { h: "12h", r: 1.84 },
  { h: "14h", r: 1.84 },
  { h: "16h", r: 1.84 },

  { h: "18h", r: 2.21 },
  { h: "20h", r: 2.21 },
  { h: "22h", r: 0.78 },
]

/** Oportunidades de economia — módulo "Economia". */

export const OPPORTUNITIES = [
  {
    machine: "Fresadora CNC Mazak QT",
    machineId: "CNC-03",
    sector: "Setor D",
    type: "IDLE prolongado",
    costDay: 892,
    costMonth: 19624,
    costYear: 235488,
    action: "Desligar fora de turno",
    confidence: "alta",
  },

  {
    machine: "Centro de Usinagem DMG 60",
    machineId: "CNC-02",
    sector: "Setor D",
    type: "Anomalia elétrica",
    costDay: 640,
    costMonth: 14080,
    costYear: 168960,
    action: "Manutenção elétrica imediata",
    confidence: "alta",
  },

  {
    machine: "Injetora Krauss 350T",
    machineId: "INJ-02",
    sector: "Setor A",
    type: "IDLE + FP baixo",
    costDay: 412,
    costMonth: 9064,
    costYear: 108768,
    action: "Capacitor + controle de turno",
    confidence: "média",
  },

  {
    machine: "Compressor Schulz 55kW",
    machineId: "COMP-02",
    sector: "Setor B",
    type: "Sobrecarga contínua",
    costDay: 380,
    costMonth: 8360,
    costYear: 100320,
    action: "Manutenção preventiva",
    confidence: "alta",
  },

  {
    machine: "Prensa Excêntrica 80T",
    machineId: "PRENSA-02",
    sector: "Setor C",
    type: "IDLE + variação V",
    costDay: 280,
    costMonth: 6160,
    costYear: 73920,
    action: "Verificar QD-C + turno",
    confidence: "média",
  },
]

/**
 * Protocolos de ocorrência (MÓDULO PROTOCOLAR) — histórico inicial.
 * O SLA (deadline) e a situação são calculados pelo store via server/protocol.mjs.
 */

export const PROTOCOLS = [
  {
    id: "EMS-2026-0003",
    title: "Sobrecorrente no Compressor Schulz 55kW",

    machineId: "COMP-02",
    machine: "Compressor Schulz 55kW",
    sector: "Setor B",

    origin: "Alerta automático",
    priority: "critical",
    status: "in_progress",

    alertId: "ALT-2026-0040",
    assignee: "Técnico M. Santos",

    description:
      "Corrente de 78,4 A com temperatura de 97°C. Inspeção elétrica e térmica em andamento.",

    openedAt: "2026-09-30T08:22:00",

    evidence: ["I_fase = 78,4 A", "T = 97 °C (limite 85 °C)"],

    events: [
      {
        at: "2026-09-30T08:22:00",
        type: "abertura",
        actor: "Sistema EMS",
        note: "Protocolo aberto automaticamente a partir do alerta ALT-2026-0040.",
      },

      {
        at: "2026-09-30T08:35:00",
        type: "tratativa",
        actor: "Técnico M. Santos",
        note: "Alerta reconhecido; equipe acionada.",
      },

      {
        at: "2026-09-30T09:10:00",
        type: "evidência",
        actor: "Técnico M. Santos",
        note: "Medição de corrente registrada no quadro QD-B.",
      },
    ],
  },

  {
    id: "EMS-2026-0002",
    title: "IDLE prolongado — Fresadora CNC Mazak QT",

    machineId: "CNC-03",
    machine: "Fresadora CNC Mazak QT",
    sector: "Setor D",

    origin: "Alerta automático",
    priority: "high",
    status: "pending_validation",

    alertId: "ALT-2026-0038",
    assignee: "Técnico E. Lima",

    description:
      "Máquina em IDLE por 68 min. Intervenção de desligamento fora de turno aplicada.",

    openedAt: "2026-09-30T12:50:00",

    evidence: ["IDLE 68 min", "R$ 892/dia estimado"],

    events: [
      {
        at: "2026-09-30T12:50:00",
        type: "abertura",
        actor: "Sistema EMS",
        note: "Protocolo aberto a partir do alerta de consumo improdutivo.",
      },

      {
        at: "2026-09-30T13:20:00",
        type: "tratativa",
        actor: "Técnico E. Lima",
        note: "Desligamento agendado para 13h conforme recomendação.",
      },

      {
        at: "2026-09-30T15:00:00",
        type: "evidência",
        actor: "Técnico E. Lima",
        note: "Comparação antes × depois anexada.",
      },

      {
        at: "2026-09-30T15:05:00",
        type: "validação",
        actor: "Supervisor L. Rocha",
        note: "Aguardando validação final de ganho.",
      },
    ],
  },

  {
    id: "EMS-2026-0001",
    title: "Ajuste de temporização — Compressor Atlas 75kW",

    machineId: "COMP-01",
    machine: "Compressor Atlas 75kW",
    sector: "Setor B",

    origin: "Manutenção preventiva",
    priority: "medium",
    status: "closed",

    alertId: "ALT-2026-0035",
    assignee: "Técnico M. Santos",

    description: "Ciclos desnecessários eliminados com ajuste de temporização.",

    openedAt: "2026-09-29T07:00:00",
    closedAt: "2026-09-29T16:30:00",

    evidence: ["Economia estimada: R$ 290/mês"],

    events: [
      {
        at: "2026-09-29T07:00:00",
        type: "abertura",
        actor: "Operador EMS",
        note: "Protocolo aberto a partir de alerta de eficiência.",
      },

      {
        at: "2026-09-29T08:10:00",
        type: "tratativa",
        actor: "Técnico M. Santos",
        note: "Ajuste de temporização aplicado.",
      },

      {
        at: "2026-09-29T16:20:00",
        type: "validação",
        actor: "Supervisor L. Rocha",
        note: "Ganho comprovado após 8 h de operação.",
      },

      {
        at: "2026-09-29T16:30:00",
        type: "encerramento",
        actor: "Supervisor L. Rocha",
        note: "Protocolo encerrado dentro do SLA.",
      },
    ],
  },
]
