/**
 * Agendador simples (substitui `setInterval` espalhado).
 *
 * O passo de telemetria e uma tarefa de INFRAESTRUTURA: nao bloqueia
 * requisicoes HTTP (execucao sequencial controlada, com guarda de reentrada).
 */

export interface SchedulerOptions {
  intervalMs: number
  run: () => Promise<unknown>
  onError?: (error: unknown) => void
}

export interface Scheduler {
  start(): void
  stop(): void
  /** Executa um passo imediatamente (usado por POST /api/sim/tick). */
  runNow(): Promise<void>
  readonly running: boolean
  readonly ticks: number
}

export function createScheduler(options: SchedulerOptions): Scheduler {
  let timer: NodeJS.Timeout | null = null
  let inFlight = false
  let ticks = 0

  async function tick(): Promise<void> {
    if (inFlight) return
    inFlight = true
    try {
      await options.run()
      ticks += 1
    } catch (error) {
      options.onError?.(error)
    } finally {
      inFlight = false
    }
  }

  return {
    start(): void {
      if (timer) return
      timer = setInterval(() => {
        void tick()
      }, options.intervalMs)
      timer.unref?.()
    },

    stop(): void {
      if (!timer) return
      clearInterval(timer)
      timer = null
    },

    async runNow(): Promise<void> {
      await tick()
    },

    get running(): boolean {
      return timer !== null
    },

    get ticks(): number {
      return ticks
    },
  }
}