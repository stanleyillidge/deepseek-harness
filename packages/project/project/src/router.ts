/** Router de modelos por complejidad, coste y presupuesto explícito. */

import { ProjectError } from './errors.ts'
import type { ProjectModelPolicy, ProjectModelRequest, ProjectModelRoute, ProjectModelTier } from './types.ts'

/** Selecciona el tier adecuado sin invocar ningún proveedor externo. */
export class ProjectModelRouter {
  constructor(private readonly policies: readonly ProjectModelPolicy[]) {}

  /** Resuelve una ruta y rechaza de forma fail-closed modelos o presupuestos ausentes. */
  select(policyId: string, request: ProjectModelRequest): ProjectModelRoute {
    const policy = this.policies.find(candidate => candidate.id === policyId)
    if (policy === undefined) throw new ProjectError(`model policy '${policyId}' is unavailable`, 'PROJECT_MODEL_UNAVAILABLE', { policyId })
    const tier = request.task.preferredTier ?? tierForComplexity(request.task.complexity)
    const route = policy.routes[tier]
    if (route === undefined || route.provider.trim() === '' || route.model.trim() === '') {
      throw new ProjectError(`no model route is configured for tier '${tier}'`, 'PROJECT_MODEL_UNAVAILABLE', { tier })
    }
    if (request.estimatedCost > policy.budget) {
      throw new ProjectError(`estimated model cost ${request.estimatedCost} exceeds budget ${policy.budget}`, 'PROJECT_MODEL_BUDGET_EXCEEDED', {
        policyId,
        budget: String(policy.budget),
      })
    }
    return { ...route, tier, estimatedCost: request.estimatedCost }
  }
}

/** Mapea la complejidad del plan al tier mínimo suficiente. */
export function tierForComplexity(complexity: ProjectModelRequest['task']['complexity']): ProjectModelTier {
  if (complexity === 'critical' || complexity === 'high') return 'strong'
  if (complexity === 'medium') return 'balanced'
  return 'cheap'
}
