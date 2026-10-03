/**
 * Application service - RELACOES ENTRE MAQUINAS (secao 11.2 / D1).
 *
 * Convencao `source -> target`. Validacoes obrigatorias:
 *   - as duas pontas existem e pertencem ao MESMO tenant;
 *   - sem auto-relacao;
 *   - unico por (source, target, type);
 *   - travessia do grafo com conjunto de visitados (rejeita ciclo).
 */

import {
  ConflictError,
  ERROR_CODES,
  NotFoundError,
  ValidationError,
} from "../../domain/errors/index.ts"
import type { MachineRelationship } from "../../domain/entities/index.ts"
import {
  RELATIONSHIP_IMPACT,
  RELATIONSHIP_TYPES,
  type RelationshipType,
} from "../../domain/value-objects/index.ts"
import { currentTenantId } from "../../shared/tenant-context.ts"
import type { ServiceContext } from "../context.ts"

export interface RelationshipInput {
  sourceMachineId?: unknown
  targetMachineId?: unknown
  relationshipType?: unknown
  dependencyLevel?: unknown
  active?: unknown
}

export interface NetworkNode {
  id: string
  name: string
  type: string
  sector: string
  upstream: string[]
  downstream: string[]
  related: string[]
}

export interface NetworkEdge {
  id: string
  source: string
  target: string
  type: RelationshipType
  dependencyLevel: number
  active: boolean
  /** A relacao propaga impacto e em que direcao (secao 11.2). */
  propagatesImpact: boolean
  impactDirection: "source_to_target" | "target_to_source" | "none"
}

export function createRelationshipService(ctx: ServiceContext) {
  const log = ctx.logger.child({ service: "RelationshipService" })

  async function list(): Promise<MachineRelationship[]> {
    return ctx.relationships.list(currentTenantId())
  }

  async function findById(id: string): Promise<MachineRelationship> {
    const found = await ctx.relationships.findById(id, currentTenantId())
    // 404 (e nao 403) para nao revelar a existencia do registro de outro tenant.
    if (!found) {
      throw new NotFoundError(`Relacao ${id} nao encontrada`, ERROR_CODES.RELATIONSHIP_NOT_FOUND)
    }
    return found
  }

  /** Existe caminho `from -> ... -> to`? Travessia com conjunto de visitados. */
  function reaches(relations: MachineRelationship[], from: string, to: string): boolean {
    const visited = new Set<string>([from])
    const queue: string[] = [from]

    while (queue.length) {
      const current = queue.shift() as string
      if (current === to) return true

      for (const rel of relations) {
        if (!rel.active) continue
        if (rel.sourceMachineId !== current) continue
        if (visited.has(rel.targetMachineId)) continue
        visited.add(rel.targetMachineId)
        queue.push(rel.targetMachineId)
      }
    }

    return false
  }

  async function create(input: RelationshipInput): Promise<MachineRelationship> {
    const source = String(input.sourceMachineId ?? "").trim()
    const target = String(input.targetMachineId ?? "").trim()
    const type = String(input.relationshipType ?? "SUPPLIES").toUpperCase() as RelationshipType

    if (!source || !target) {
      throw new ValidationError("sourceMachineId e targetMachineId sao obrigatorios")
    }
    if (source === target) {
      throw new ValidationError(
        "Auto-relacao nao e permitida",
        { code: ERROR_CODES.SELF_RELATION_NOT_ALLOWED },
      )
    }
    if (!RELATIONSHIP_TYPES.includes(type)) {
      throw new ValidationError(`Tipo invalido. Use um de: ${RELATIONSHIP_TYPES.join(", ")}`)
    }

    const tenant = currentTenantId()
    const sourceMachine = await ctx.machines.findById(source)
    const targetMachine = await ctx.machines.findById(target)

    // 404 quando a maquina nao existe OU e de outro tenant (7.1.3).
    if (!sourceMachine) {
      throw new NotFoundError(`Maquina ${source} nao encontrada`, ERROR_CODES.MACHINE_NOT_FOUND)
    }
    if (!targetMachine) {
      throw new NotFoundError(`Maquina ${target} nao encontrada`, ERROR_CODES.MACHINE_NOT_FOUND)
    }
    if (sourceMachine.tenantId !== tenant || targetMachine.tenantId !== tenant) {
      throw new NotFoundError("Maquina nao encontrada no tenant", ERROR_CODES.MACHINE_NOT_FOUND)
    }

    const duplicate = await ctx.relationships.findUnique(tenant, source, target, type)
    if (duplicate) {
      throw new ConflictError(
        "Ja existe esta relacao entre as duas maquinas",
        ERROR_CODES.RELATIONSHIP_ALREADY_EXISTS,
      )
    }

    const relations = await ctx.relationships.list(tenant)
    if (reaches(relations, target, source)) {
      throw new ConflictError(
        "A relacao criaria um ciclo no grafo de maquinas",
        ERROR_CODES.CYCLE_NOT_ALLOWED,
      )
    }

    const now = ctx.clock.now().toISOString()
    const dependencyLevel = Number(input.dependencyLevel ?? 1)
    const created: MachineRelationship = {
      id: `rel-${now.replace(/\D/g, "")}-${source}-${target}`.slice(0, 64),
      tenantId: tenant,
      sourceMachineId: source,
      targetMachineId: target,
      relationshipType: type,
      dependencyLevel: Number.isFinite(dependencyLevel) ? dependencyLevel : 1,
      active: input.active === undefined ? true : Boolean(input.active),
      createdAt: now,
      updatedAt: now,
    }

    await ctx.relationships.save(created)
    log.info("Relacao criada", { id: created.id, source, target, type })
    return created
  }

  async function update(id: string, patch: RelationshipInput): Promise<MachineRelationship> {
    await findById(id)
    const tenant = currentTenantId()
    const now = ctx.clock.now().toISOString()

    const clean: Partial<MachineRelationship> = { updatedAt: now }
    if (patch.relationshipType !== undefined) {
      const type = String(patch.relationshipType).toUpperCase() as RelationshipType
      if (!RELATIONSHIP_TYPES.includes(type)) {
        throw new ValidationError(`Tipo invalido. Use um de: ${RELATIONSHIP_TYPES.join(", ")}`)
      }
      clean.relationshipType = type
    }
    if (patch.dependencyLevel !== undefined) clean.dependencyLevel = Number(patch.dependencyLevel)
    if (patch.active !== undefined) clean.active = Boolean(patch.active)

    const updated = await ctx.relationships.update(id, tenant, clean)
    if (!updated) {
      throw new NotFoundError(`Relacao ${id} nao encontrada`, ERROR_CODES.RELATIONSHIP_NOT_FOUND)
    }
    return updated
  }

  async function remove(id: string): Promise<void> {
    const removed = await ctx.relationships.remove(id, currentTenantId())
    if (!removed) {
      throw new NotFoundError(`Relacao ${id} nao encontrada`, ERROR_CODES.RELATIONSHIP_NOT_FOUND)
    }
    log.info("Relacao removida", { id })
  }

  /**
   * Rede de Maquinas (grafo vindo da API - nunca hardcoded no frontend):
   * nos com vizinanca e arestas com a direcao de impacto.
   */
  async function network(): Promise<{ nodes: NetworkNode[]; edges: NetworkEdge[] }> {
    const tenant = currentTenantId()
    const [relations, machines] = await Promise.all([
      ctx.relationships.list(tenant),
      ctx.machines.list({}),
    ])

    const nodeMap = new Map<string, NetworkNode>()
    for (const machine of machines) {
      nodeMap.set(machine.id, {
        id: machine.id,
        name: machine.name,
        type: machine.type,
        sector: machine.sector,
        upstream: [],
        downstream: [],
        related: [],
      })
    }

    const edges: NetworkEdge[] = []
    for (const rel of relations) {
      if (!rel.active) continue
      const impact = RELATIONSHIP_IMPACT[rel.relationshipType]
      edges.push({
        id: rel.id,
        source: rel.sourceMachineId,
        target: rel.targetMachineId,
        type: rel.relationshipType,
        dependencyLevel: rel.dependencyLevel,
        active: rel.active,
        propagatesImpact: impact.propagates,
        impactDirection: impact.direction,
      })

      const source = nodeMap.get(rel.sourceMachineId)
      const target = nodeMap.get(rel.targetMachineId)
      if (source && target) {
        source.related.push(target.id)
        target.related.push(source.id)
        if (impact.direction === "source_to_target") source.downstream.push(target.id)
        if (impact.direction === "target_to_source") source.upstream.push(target.id)
        if (impact.direction === "source_to_target") target.upstream.push(source.id)
        if (impact.direction === "target_to_source") target.downstream.push(source.id)
      }
    }

    return { nodes: [...nodeMap.values()], edges }
  }

  /** Vizinhos que herdam o impacto quando `machineId` para (D2). */
  async function downstreamOf(machineId: string): Promise<string[]> {
    const relations = await ctx.relationships.list(currentTenantId())

    const visited = new Set<string>([machineId])
    const queue: string[] = [machineId]
    const downstream: string[] = []

    while (queue.length) {
      const current = queue.shift() as string
      for (const rel of relations) {
        if (!rel.active) continue
        const impact = RELATIONSHIP_IMPACT[rel.relationshipType]
        if (!impact.propagates) continue

        const next =
          impact.direction === "source_to_target" && rel.sourceMachineId === current
            ? rel.targetMachineId
            : impact.direction === "target_to_source" && rel.targetMachineId === current
              ? rel.sourceMachineId
              : null

        if (!next || visited.has(next)) continue
        visited.add(next)
        downstream.push(next)
        queue.push(next)
      }
    }

    return downstream
  }

  /** Detalhe de uma maquina na rede: dependencias, sucessoras e impacto. */
  async function machineContext(machineId: string) {
    const machine = await ctx.machines.findById(machineId)
    if (!machine) {
      throw new NotFoundError(`Maquina ${machineId} nao encontrada`, ERROR_CODES.MACHINE_NOT_FOUND)
    }

    const { edges } = await network()
    const downstream = await downstreamOf(machineId)

    return {
      machine,
      upstream: edges.filter((e) => e.target === machineId).map((e) => ({ id: e.source, type: e.type })),
      downstream: edges.filter((e) => e.source === machineId).map((e) => ({ id: e.target, type: e.type })),
      impactedDownstream: downstream,
      related: edges.filter((e) => e.source === machineId || e.target === machineId),
    }
  }

  return { list, findById, create, update, remove, network, downstreamOf, machineContext }
}

export type RelationshipService = ReturnType<typeof createRelationshipService>
