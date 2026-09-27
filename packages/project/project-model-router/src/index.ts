// Visión general del proceso:
// Este módulo convierte requisitos y snapshots de capacidad en una decisión
// determinista de ruta. Solo selecciona identificadores; nunca invoca un LLM,
// actualiza cuotas ni modifica el estado del proveedor.
//
// Detalle paso a paso:
// 1. Se descartan candidatos inválidos, en cooldown, sin cuota o sin capacidad.
// 2. Los candidatos elegibles se ordenan por coste, ajuste de complejidad,
//    capacidad sobrante, cuota restante e identificador.
// 3. El escalamiento excluye rutas previas y prioriza una capacidad de
//    complejidad superior cuando existe.

import type {
  ModelCandidate,
  ModelComplexity,
  ModelRoute,
  ModelRouteDecision,
  ModelRouteInventory,
  ModelRouteRejection,
  ModelRouteRejectionReason,
  ModelRouter,
  ModelRoutingRequest,
} from './types.ts'

export type * from './types.ts'

const COMPLEXITIES: readonly ModelComplexity[] = ['low', 'medium', 'high', 'critical']

function complexityRank(value: ModelComplexity): number {
  return COMPLEXITIES.indexOf(value)
}

function isComplexity(value: unknown): value is ModelComplexity {
  return typeof value === 'string' && COMPLEXITIES.includes(value as ModelComplexity)
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function rejection(modelId: string, reason: ModelRouteRejectionReason): ModelRouteRejection {
  return { modelId, reason }
}

function isValidCandidate(candidate: ModelCandidate): boolean {
  return candidate.id.trim().length > 0
    && isComplexity(candidate.maxComplexity)
    && isSafeNonNegativeInteger(candidate.contextWindowTokens)
    && isFiniteNonNegative(candidate.cost)
    && (candidate.quota === undefined
      || isSafeNonNegativeInteger(candidate.quota.remainingRequests)
      && isSafeNonNegativeInteger(candidate.quota.remainingTokens))
    && (candidate.cooldownUntil === undefined || Number.isFinite(candidate.cooldownUntil))
}

function validRequest(request: ModelRoutingRequest): boolean {
  return isComplexity(request.complexity)
    && isSafeNonNegativeInteger(request.requiredContextTokens)
    && isSafeNonNegativeInteger(request.estimatedTokens)
    && Number.isFinite(request.now)
}

function candidateRejection(
  candidate: ModelCandidate,
  request: ModelRoutingRequest,
  attempted: ReadonlySet<string>,
): ModelRouteRejectionReason | undefined {
  if (!isValidCandidate(candidate)) return 'invalid-candidate'
  if (attempted.has(candidate.id)) return 'attempted'
  if (complexityRank(candidate.maxComplexity) < complexityRank(request.complexity)) return 'complexity'
  if (candidate.contextWindowTokens < request.requiredContextTokens) return 'capacity'
  if (candidate.quota !== undefined
    && (candidate.quota.remainingRequests < 1 || candidate.quota.remainingTokens < request.estimatedTokens)) return 'quota'
  if (candidate.cooldownUntil !== undefined && candidate.cooldownUntil > request.now) return 'cooldown'
  return undefined
}

function sortCandidates(
  candidates: readonly ModelCandidate[],
  request: ModelRoutingRequest,
  preferEscalation: ModelCandidate | undefined,
): ModelCandidate[] {
  const eligible = [...candidates]
  eligible.sort((left, right) => {
    if (preferEscalation !== undefined) {
      const leftHigher = complexityRank(left.maxComplexity) > complexityRank(preferEscalation.maxComplexity)
      const rightHigher = complexityRank(right.maxComplexity) > complexityRank(preferEscalation.maxComplexity)
      if (leftHigher !== rightHigher) return leftHigher ? -1 : 1
    }
    if (left.cost !== right.cost) return left.cost - right.cost
    const leftFit = complexityRank(left.maxComplexity) - complexityRank(request.complexity)
    const rightFit = complexityRank(right.maxComplexity) - complexityRank(request.complexity)
    if (leftFit !== rightFit) return leftFit - rightFit
    const leftCapacity = left.contextWindowTokens - request.requiredContextTokens
    const rightCapacity = right.contextWindowTokens - request.requiredContextTokens
    if (leftCapacity !== rightCapacity) return leftCapacity - rightCapacity
    const leftQuota = left.quota?.remainingTokens ?? Number.MAX_SAFE_INTEGER
    const rightQuota = right.quota?.remainingTokens ?? Number.MAX_SAFE_INTEGER
    if (leftQuota !== rightQuota) return rightQuota - leftQuota
    return left.id.localeCompare(right.id)
  })
  return eligible
}

function selectInternal(
  request: ModelRoutingRequest,
  inventory: ModelRouteInventory,
  escalation: number,
  previousCandidate: ModelCandidate | undefined,
): ModelRouteDecision {
  const considered: ModelRouteRejection[] = []
  if (!validRequest(request)) {
    return {
      kind: 'unavailable',
      route: null,
      candidate: null,
      considered: [rejection('request', 'invalid-request')],
    }
  }
  const attempted = new Set(request.attemptedModelIds ?? [])
  if (previousCandidate !== undefined) attempted.add(previousCandidate.id)
  const eligible: ModelCandidate[] = []
  const seen = new Set<string>()
  for (const [index, candidate] of inventory.candidates.entries()) {
    const modelId = typeof candidate.id === 'string' && candidate.id.trim().length > 0 ? candidate.id : `#${String(index)}`
    if (seen.has(modelId)) {
      considered.push(rejection(modelId, 'duplicate-id'))
      continue
    }
    seen.add(modelId)
    const reason = candidateRejection(candidate, request, attempted)
    if (reason !== undefined) {
      considered.push(rejection(modelId, reason))
    } else {
      eligible.push(candidate)
    }
  }
  if (eligible.length === 0) {
    return { kind: 'unavailable', route: null, candidate: null, considered }
  }
  const ordered = sortCandidates(eligible, request, previousCandidate)
  const candidate = ordered[0]
  if (candidate === undefined) return { kind: 'unavailable', route: null, candidate: null, considered }
  const route: ModelRoute = { modelId: candidate.id, escalation }
  return { kind: 'selected', route, candidate, considered }
}

/**
 * Router sin estado que solo calcula decisiones a partir de snapshots.
 * El adaptador que llama a este servicio conserva la autoridad para resolver
 * y ejecutar el identificador seleccionado.
 */
export class DeterministicModelRouter implements ModelRouter {
  /**
   * Selecciona el candidato elegible más barato.
   * @param request - requisitos explícitos y reloj de la selección.
   * @param inventory - snapshot de candidatos entregado por el adaptador.
   * @returns Ruta seleccionada o diagnóstico de indisponibilidad.
   */
  select(request: ModelRoutingRequest, inventory: ModelRouteInventory): ModelRouteDecision {
    return selectInternal(request, inventory, 0, undefined)
  }

  /**
   * Selecciona el siguiente candidato después de un intento anterior.
   * @param request - requisitos y modelos ya intentados.
   * @param inventory - snapshot de candidatos entregado por el adaptador.
   * @param previous - ruta que no debe repetirse.
   * @returns Ruta escalada o diagnóstico de indisponibilidad.
   */
  escalate(request: ModelRoutingRequest, inventory: ModelRouteInventory, previous: ModelRoute): ModelRouteDecision {
    const previousCandidate = inventory.candidates.find(candidate => candidate.id === previous.modelId)
    return selectInternal({
      ...request,
      attemptedModelIds: [...(request.attemptedModelIds ?? []), previous.modelId],
    }, inventory, previous.escalation + 1, previousCandidate)
  }
}

const defaultRouter = new DeterministicModelRouter()

/**
 * Selecciona una ruta sin crear un objeto de integración.
 * @param request - requisitos explícitos y reloj de la selección.
 * @param inventory - snapshot de candidatos.
 * @returns Decisión determinista del router.
 */
export function selectModelRoute(request: ModelRoutingRequest, inventory: ModelRouteInventory): ModelRouteDecision {
  return defaultRouter.select(request, inventory)
}

/**
 * Calcula un escalamiento sin invocar al proveedor.
 * @param request - requisitos explícitos y modelos ya intentados.
 * @param inventory - snapshot de candidatos.
 * @param previous - ruta que ya fue intentada.
 * @returns Siguiente decisión determinista.
 */
export function escalateModelRoute(
  request: ModelRoutingRequest,
  inventory: ModelRouteInventory,
  previous: ModelRoute,
): ModelRouteDecision {
  return defaultRouter.escalate(request, inventory, previous)
}
