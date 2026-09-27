// Visión general del proceso:
// Este módulo declara el intercambio puro entre un inventario de modelos y el
// router. El consumidor adapta el LLM existente a estos datos sin entregar al
// paquete acceso a proveedores ni a llamadas de red.
//
// Detalle paso a paso:
// 1. ModelCandidate describe complejidad, capacidad, coste, cuota y cooldown.
// 2. ModelRoutingRequest contiene los requisitos de una selección.
// 3. ModelRouteDecision expresa selección, exclusión y escalamiento.

/** Nivel de complejidad que un modelo puede atender. */
export type ModelComplexity = 'low' | 'medium' | 'high' | 'critical'

/** Cuota restante que el consumidor obtuvo de su fuente de estado. */
export interface ModelQuota {
  /** Solicitudes que todavía pueden admitirse. */
  readonly remainingRequests: number
  /** Tokens que todavía pueden consumirse. */
  readonly remainingTokens: number
}

/** Capacidad observable de un modelo, sin dependencia de un proveedor concreto. */
export interface ModelCandidate {
  /** Identificador opaco que el adaptador resolverá al ejecutar la ruta. */
  readonly id: string
  /** Complejidad máxima soportada por el modelo. */
  readonly maxComplexity: ModelComplexity
  /** Ventana de contexto disponible, expresada en tokens. */
  readonly contextWindowTokens: number
  /** Coste estimado suministrado por el consumidor; no se calcula aquí. */
  readonly cost: number
  /** Cuota restante; ausencia significa que el consumidor no impone cuota. */
  readonly quota?: ModelQuota
  /** Instante Unix en milisegundos hasta el que el modelo no debe usarse. */
  readonly cooldownUntil?: number
}

/** Requisitos de una selección de modelo. Todos los valores temporales son explícitos. */
export interface ModelRoutingRequest {
  /** Complejidad mínima que debe cubrir la ruta. */
  readonly complexity: ModelComplexity
  /** Tokens que la solicitud necesita conservar en contexto. */
  readonly requiredContextTokens: number
  /** Tokens estimados que la cuota debe poder consumir. */
  readonly estimatedTokens: number
  /** Instante Unix en milisegundos usado para evaluar cooldown. */
  readonly now: number
  /** Modelos que ya fallaron o fueron usados en esta cadena de escalamiento. */
  readonly attemptedModelIds?: readonly string[]
}

/** Ruta seleccionada, sin ejecutar ninguna operación del LLM. */
export interface ModelRoute {
  /** Identificador del modelo que el adaptador debe resolver. */
  readonly modelId: string
  /** Número de escalamiento aplicado; cero representa la primera selección. */
  readonly escalation: number
}

/** Motivo por el que un modelo no fue elegible. */
export type ModelRouteRejectionReason =
  | 'invalid-request'
  | 'invalid-candidate'
  | 'duplicate-id'
  | 'attempted'
  | 'complexity'
  | 'capacity'
  | 'quota'
  | 'cooldown'

/** Diagnóstico de un modelo descartado antes de la selección. */
export interface ModelRouteRejection {
  /** Identificador del candidato, o su posición si el identificador no es válido. */
  readonly modelId: string
  /** Regla que descartó el candidato. */
  readonly reason: ModelRouteRejectionReason
}

/** Resultado de una selección o de un escalamiento agotado. */
export type ModelRouteDecision =
  | {
    readonly kind: 'selected'
    readonly route: ModelRoute
    readonly candidate: ModelCandidate
    readonly considered: readonly ModelRouteRejection[]
  }
  | {
    readonly kind: 'unavailable'
    readonly route: null
    readonly candidate: null
    readonly considered: readonly ModelRouteRejection[]
  }

/** Inventario que un adaptador puede entregar al router sin exponer su implementación. */
export interface ModelRouteInventory {
  /** Candidatos observados para la selección actual. */
  readonly candidates: readonly ModelCandidate[]
}

/** Interfaz de integración: resuelve datos y deja la ejecución al consumidor. */
export interface ModelRouter {
  /** Selecciona el candidato elegible más barato de un inventario. */
  select(request: ModelRoutingRequest, inventory: ModelRouteInventory): ModelRouteDecision
  /** Escala después de un intento, excluyendo rutas ya intentadas. */
  escalate(request: ModelRoutingRequest, inventory: ModelRouteInventory, previous: ModelRoute): ModelRouteDecision
}
