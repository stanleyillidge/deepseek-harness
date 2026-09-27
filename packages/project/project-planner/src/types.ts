// Visión general del proceso:
// Este módulo declara el formato PlanV1 y los resultados de validación que
// utiliza el planificador. No contiene lógica ni dependencias de ejecución.
//
// Detalle paso a paso:
// 1. PlanV1 describe tareas, dependencias y scopes permitidos.
// 2. PlanValidationLimits expresa los límites que el validador debe aplicar.
// 3. Los resultados separan un plan válido de sus diagnósticos deterministas.

/** Complejidad declarada de una tarea y nivel mínimo que debe soportar un modelo. */
export type PlanComplexity = 'low' | 'medium' | 'high' | 'critical'

/** Una tarea del DAG de un {@link PlanV1}. */
export interface PlanTaskV1 {
  /** Identificador único y estable dentro del plan. */
  readonly id: string
  /** Instrucción que el consumidor entregará al ejecutor de la tarea. */
  readonly prompt: string
  /** Complejidad mínima requerida por la tarea. */
  readonly complexity: PlanComplexity
  /** Identificadores de tareas que deben terminar antes de esta tarea. */
  readonly dependsOn?: readonly string[]
  /** Scopes requeridos por la tarea; deben pertenecer a {@link PlanV1.scopes}. */
  readonly scopes?: readonly string[]
  /** Tokens de entrada previstos para aplicar límites de trabajo. */
  readonly estimatedInputTokens?: number
  /** Tokens de salida previstos para aplicar límites de trabajo. */
  readonly estimatedOutputTokens?: number
}

/** Plan versionado de tareas ejecutables como un grafo acíclico dirigido. */
export interface PlanV1 {
  /** Versión de este formato; el único valor aceptado actualmente es `1`. */
  readonly version: 1
  /** Identificador del plan, útil para trazas y correlación del consumidor. */
  readonly id: string
  /** Scopes autorizados por el plan para sus tareas. */
  readonly scopes?: readonly string[]
  /** Tareas del grafo. El orden de entrada no define el orden de ejecución. */
  readonly tasks: readonly PlanTaskV1[]
}

/** Límites deterministas aplicados a un PlanV1 completo. */
export interface PlanValidationLimits {
  /** Número máximo de tareas. */
  readonly maxTasks: number
  /** Número máximo de dependencias de una tarea. */
  readonly maxDependenciesPerTask: number
  /** Profundidad máxima del DAG, contando la raíz como uno. */
  readonly maxDepth: number
  /** Número máximo de scopes declarados por el plan. */
  readonly maxScopesPerPlan: number
  /** Número máximo de scopes declarados por una tarea. */
  readonly maxScopesPerTask: number
  /** Longitud máxima del prompt de una tarea. */
  readonly maxPromptCharacters: number
  /** Suma máxima de tokens previstos en todas las tareas. */
  readonly maxEstimatedTokens: number
}

/** Opciones del validador; los límites omitidos usan los límites publicados. */
export interface PlanValidationOptions {
  /** Reemplazos parciales de los límites publicados. */
  readonly limits?: Partial<PlanValidationLimits>
}

/** Código estable de un diagnóstico de validación. */
export type PlanValidationIssueCode =
  | 'invalid-plan'
  | 'invalid-version'
  | 'invalid-id'
  | 'invalid-tasks'
  | 'duplicate-task'
  | 'invalid-task'
  | 'invalid-prompt'
  | 'invalid-complexity'
  | 'invalid-dependencies'
  | 'duplicate-dependency'
  | 'missing-dependency'
  | 'cycle'
  | 'invalid-scopes'
  | 'duplicate-scope'
  | 'scope-not-allowed'
  | 'limit-exceeded'

/** Diagnóstico ordenado de una entrada que no cumple PlanV1. */
export interface PlanValidationIssue {
  /** Código que permite a un consumidor reaccionar sin analizar el mensaje. */
  readonly code: PlanValidationIssueCode
  /** Ruta estable dentro del valor recibido. */
  readonly path: string
  /** Explicación humana del incumplimiento. */
  readonly message: string
  /** Identificadores del ciclo cuando el diagnóstico corresponde a un ciclo. */
  readonly cycle?: readonly string[]
}

/** Resultado exitoso con el orden topológico y los niveles calculados. */
export interface ValidatedPlanV1 {
  /** Plan validado, conservado sin mutar. */
  readonly plan: PlanV1
  /** Orden topológico estable, con desempate lexicográfico por `id`. */
  readonly executionOrder: readonly string[]
  /** Niveles paralelizables del DAG, desde la raíz hasta la hoja. */
  readonly levels: readonly (readonly string[])[]
  /** Profundidad máxima calculada del DAG. */
  readonly depth: number
  /** Tokens previstos sumados en todas las tareas. */
  readonly estimatedTokens: number
}

/** Resultado discriminado de la validación de un plan. */
export type PlanValidationResult =
  | { readonly ok: true; readonly value: ValidatedPlanV1 }
  | { readonly ok: false; readonly issues: readonly PlanValidationIssue[] }
