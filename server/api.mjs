/**
 * EnergyMatrix EMS — roteador REST.
 *
 * `handle({ method, path, query, body })` → `{ status, body }`.
 * Reutilizado pelo servidor standalone (server/index.mjs) e pelo middleware
 * do Vite (server/vite-plugin.mjs), garantindo comportamento idêntico.
 */

import { createStore, httpError } from "./store.mjs"

export const API_PREFIX = "/api"

export const API_ROUTES = [
  "GET    /api/health",

  "GET    /api/plants",

  "GET    /api/summary",

  "GET    /api/dashboard",

  "GET    /api/sectors",

  "GET    /api/analytics/idle",

  "GET    /api/analytics/anomalies",

  "GET    /api/analytics/cost",

  "GET    /api/machines",

  "GET    /api/machines/:id",

  "GET    /api/machines/:id/telemetry",

  "GET    /api/machines/:id/analytics",

  "POST   /api/machines",

  "PATCH  /api/machines/:id",

  "DELETE /api/machines/:id",

  "GET    /api/alerts",

  "GET    /api/alerts/summary",

  "POST   /api/alerts/:id/advance",

  "GET    /api/economy",

  "GET    /api/economy/interventions",

  "POST   /api/economy/interventions",

  "GET    /api/interventions",

  "POST   /api/interventions",

  "GET    /api/reports",

  "GET    /api/admin",

  "GET    /api/admin/tariffs",

  "PATCH  /api/admin/tariffs",

  "GET    /api/admin/thresholds",

  "PATCH  /api/admin/thresholds",

  "POST   /api/admin/shifts/:id/toggle",

  "GET    /api/competition",

  "GET    /api/competition/dashboard",

  "GET    /api/competition/machines",

  "GET    /api/competition/machines/:id",

  "GET    /api/competition/machines/:id/telemetry",

  "GET    /api/competition/analytics",

  "GET    /api/demo/status",

  "POST   /api/demo/scenario",

  "POST   /api/demo/reset",

  "POST   /api/demo/step",

  "GET    /api/protocols",

  "GET    /api/protocols/summary",

  "POST   /api/protocols",

  "GET    /api/protocols/:id",

  "POST   /api/protocols/:id/advance",

  "POST   /api/protocols/:id/events",

  "POST   /api/sim/tick",
]

const ok = (body) => ({ status: 200, body })

export function createApi(options = {}) {
  const store = createStore({ live: options.live !== false })

  const tickIntervalMs = options.tickIntervalMs ?? 5000

  let timer = null

  function start() {
    if (!store.state.live || timer) return

    timer = setInterval(() => store.tick(), tickIntervalMs)

    if (typeof timer.unref === "function") timer.unref()
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  async function handle({
    method = "GET",
    path = "/",
    query = {},
    body = {},
  } = {}) {
    const m = String(method).toUpperCase()

    const seg = String(path).split("?")[0].split("/").filter(Boolean)

    const [, r1, r2, r3] = seg

    try {
      if (r1 === undefined)
        throw httpError(404, `Rota não encontrada: ${m} ${path}`)

      /* ---------- Saúde / plantas ---------- */

      if (r1 === "health" && m === "GET") return ok(store.getHealth())

      if (r1 === "plants" && m === "GET") return ok(store.getPlants())

      if (r1 === "summary" && m === "GET") return ok(store.getSummary())

      if (r1 === "sectors" && m === "GET") return ok(store.getSectors())

      if (r1 === "dashboard" && m === "GET")
        return ok(store.getCompetitionDashboard())

      /* ---------- Analytics (motor determinístico do demo) ---------- */

      if (r1 === "analytics" && m === "GET") {
        const a = store.getCompetitionAnalytics()

        if (r2 === "idle") return ok(a.idle)

        if (r2 === "anomalies") return ok(a.anomalies)

        if (r2 === "cost") return ok(a.cost)

        return ok(a)
      }

      /* ---------- Intervenções do Competition Mode ---------- */

      if (r1 === "interventions") {
        if (!r2 && m === "GET") return ok(store.getCompetition().interventions)

        if (!r2 && m === "POST") {
          if (!body || !Object.keys(body).length)
            throw httpError(400, "Corpo da intervenção é obrigatório")

          return { status: 201, body: store.addCompetitionIntervention(body) }
        }
      }

      /* ---------- Competition Mode (demo determinístico) ---------- */

      if (r1 === "competition" && m === "GET") {
        if (!r2) return ok(store.getCompetition())

        if (r2 === "dashboard") return ok(store.getCompetitionDashboard())

        if (r2 === "analytics") return ok(store.getCompetitionAnalytics())

        if (r2 === "machines" && !r3) return ok(store.getCompetitionMachines())

        if (r2 === "machines" && r3) {
          const machine = store.getCompetitionMachine(r3)

          if (!machine)
            throw httpError(404, `Máquina ${r3} não encontrada no demo`)

          return ok(machine)
        }
      }

      /* ---------- Demo (ativar cenário / resetar / passo) ---------- */

      if (r1 === "demo") {
        if (r2 === "status" && m === "GET") return ok(store.getCompetition())

        if (r2 === "scenario" && m === "POST") {
          const name = String(
            body.scenario ?? body.scenarioId ?? "NORMAL",
          ).toUpperCase()

          return ok(store.setCompetitionScenario(name))
        }

        if (r2 === "reset" && m === "POST") return ok(store.resetCompetition())

        if (r2 === "step" && m === "POST") return ok(store.stepCompetition())
      }

      /* ---------- Protocolos (módulo protocolar) ---------- */

      if (r1 === "protocols") {
        if (!r2 && m === "GET") return ok(store.getProtocols(query))

        if (!r2 && m === "POST")
          return { status: 201, body: store.addProtocol(body) }

        if (r2 === "summary" && m === "GET")
          return ok(store.getProtocolsSummary())

        if (r2 && r3 === "advance" && m === "POST") {
          const updated = store.advanceProtocol(r2, body)

          if (!updated) throw httpError(404, `Protocolo ${r2} não encontrado`)

          return ok(updated)
        }

        if (r2 && r3 === "events" && m === "POST") {
          const updated = store.addProtocolEvent(r2, body)

          if (!updated) throw httpError(404, `Protocolo ${r2} não encontrado`)

          return ok(updated)
        }

        if (r2 && m === "GET") {
          const item = store.getProtocol(r2)

          if (!item) throw httpError(404, `Protocolo ${r2} não encontrado`)

          return ok(item)
        }
      }

      /* ---------- Máquinas ---------- */

      if (r1 === "machines") {
        if (!r2 && m === "GET") return ok(store.getMachines(query))

        if (!r2 && m === "POST")
          return { status: 201, body: store.addMachine(body) }

        if (r2 && r3 === "telemetry" && m === "GET") {
          const demo = store.getCompetitionTelemetry(r2)

          if (demo) return ok({ machineId: r2, simulated: true, points: demo })

          const machine = store.getMachine(r2)

          if (!machine) throw httpError(404, `Máquina ${r2} não encontrada`)

          return ok({
            machineId: r2,
            simulated: false,
            points: machine.loadCurve ?? [],
          })
        }

        if (r2 && r3 === "analytics" && m === "GET") {
          const all = store.getCompetitionAnalytics()

          const machine = store.getCompetitionMachine(r2)

          if (!machine)
            return ok({
              machineId: r2,
              simulated: false,
              note: "Sem analytics determinístico para esta máquina",
            })

          return ok({
            machineId: r2,
            simulated: true,
            state: machine.state,
            quality: machine.quality,

            powerKw: machine.power,
            baselineKw: machine.baselineKw,
            deviationPct: machine.deviationPct,

            anomalies: all.anomalies.filter((a) => a.machineId === r2),
          })
        }

        if (r2 && m === "GET") {
          const machine = store.getMachine(r2)

          if (!machine) throw httpError(404, `Máquina ${r2} não encontrada`)

          return ok(machine)
        }

        if (r2 && m === "PATCH") {
          const machine = store.updateMachine(r2, body)

          if (!machine) throw httpError(404, `Máquina ${r2} não encontrada`)

          return ok(machine)
        }

        if (r2 && m === "DELETE") {
          if (!store.removeMachine(r2))
            throw httpError(404, `Máquina ${r2} não encontrada`)

          return { status: 204, body: null }
        }
      }

      /* ---------- Alertas ---------- */

      if (r1 === "alerts") {
        if (!r2 && m === "GET") return ok(store.getAlerts(query))

        if (r2 === "summary" && m === "GET") return ok(store.getAlertsSummary())

        if (r2 && r3 === "advance" && m === "POST") {
          const alert = store.advanceAlert(r2, body)

          if (!alert) throw httpError(404, `Alerta ${r2} não encontrado`)

          return ok(alert)
        }
      }

      /* ---------- Economia ---------- */

      if (r1 === "economy") {
        if (!r2 && m === "GET") return ok(store.getEconomy())

        if (r2 === "interventions" && m === "GET")
          return ok(store.getInterventions())

        if (r2 === "interventions" && m === "POST")
          return { status: 201, body: store.addIntervention(body) }
      }

      /* ---------- Relatórios ---------- */

      if (r1 === "reports" && m === "GET") return ok(store.getReports())

      /* ---------- Administração ---------- */

      if (r1 === "admin") {
        if (!r2 && m === "GET") return ok(store.getAdmin())

        if (r2 === "tariffs" && m === "GET") return ok(store.getTariff())

        if (r2 === "tariffs" && m === "PATCH") return ok(store.setTariff(body))

        if (r2 === "thresholds" && m === "GET") return ok(store.getThresholds())

        if (r2 === "thresholds" && m === "PATCH")
          return ok(store.setThresholds(body))

        if (r2 === "shifts" && r3 && m === "POST") {
          const shift = store.toggleShift(r3)

          if (!shift) throw httpError(404, `Turno ${r3} não encontrado`)

          return ok(shift)
        }
      }

      /* ---------- Simulação / telemetria ---------- */

      if (r1 === "sim") {
        if (r2 === "tick" && m === "POST") {
          store.tick()
          return ok(store.getHealth())
        }
      }

      throw httpError(404, `Rota não encontrada: ${m} ${path}`)
    } catch (err) {
      const status = err.status ?? 500

      return {
        status,
        body: { error: err.message || "Erro interno do servidor" },
      }
    }
  }

  return { handle, store, start, stop }
}
