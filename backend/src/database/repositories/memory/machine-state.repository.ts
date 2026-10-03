/**
 * Repository EM MEMORIA - estados derivados em intervalos (machine_states).
 */

import type { MachineStateInterval, IMachineStateRepository } from "../../../domain/ports/index.ts"
import type { MachineState } from "../../../domain/value-objects/index.ts"
import type { MemoryStore } from "./memory-state.ts"

export function createMemoryMachineStateRepository(store: MemoryStore): IMachineStateRepository {
  const { state } = store

  function assertOpen(machineId: string): MachineStateInterval | null {
    return (
      state.machineStates.find((i) => i.machineId === machineId && i.toTs === null) ?? null
    )
  }

  return {
    async openInterval(machineId: string, machineState: MachineState, at: Date): Promise<void> {
      const open = assertOpen(machineId)
      if (open) {
        if (open.state === machineState) return
        open.toTs = new Date(at)
      }
      state.machineStates.push({
        machineId,
        state: machineState,
        fromTs: new Date(at),
        toTs: null,
      })
    },

    async current(machineId: string): Promise<MachineStateInterval | null> {
      const open = assertOpen(machineId)
      return open ? { ...open, fromTs: new Date(open.fromTs) } : null
    },

    async list(machineId: string, from?: Date): Promise<MachineStateInterval[]> {
      return state.machineStates
        .filter((i) => i.machineId === machineId)
        .filter((i) => (from ? i.fromTs.getTime() >= from.getTime() : true))
        .map((i) => ({ ...i, fromTs: new Date(i.fromTs), toTs: i.toTs ? new Date(i.toTs) : null }))
    },

    async idleMinutes(machineId: string, now: Date): Promise<number> {
      const open = assertOpen(machineId)
      if (!open || open.state !== "IDLE") return 0
      return Number(((now.getTime() - open.fromTs.getTime()) / 60000).toFixed(1))
    },
  }
}