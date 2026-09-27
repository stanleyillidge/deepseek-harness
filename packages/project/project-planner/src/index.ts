// Visión general del proceso:
// Este módulo valida PlanV1 como una entrada de datos no confiable y produce
// un orden topológico estable para un DAG. La validación no ejecuta tareas ni
// conoce ningún proveedor de modelos.
//
// Detalle paso a paso:
// 1. Se comprueba la forma, los identificadores, scopes, prompts y límites.
// 2. Se comprueban dependencias existentes, duplicadas y ciclos con recorridos
//    ordenados por identificador.
// 3. Se calcula un orden topológico y niveles reproducibles para el consumidor.

import type {
  PlanComplexity,
  PlanTaskV1,
  PlanV1,
  PlanValidationIssue,
  PlanValidationLimits,
  PlanValidationOptions,
  PlanValidationResult,
  ValidatedPlanV1,
} from './types.ts'

export type * from './types.ts'

/** Límites predeterminados para planes que no suministran límites parciales. */
export const DEFAULT_PLAN_VALIDATION_LIMITS: PlanValidationLimits = {
  maxTasks: 256,
  maxDependenciesPerTask: 32,
  maxDepth: 64,
  maxScopesPerPlan: 64,
  maxScopesPerTask: 16,
  maxPromptCharacters: 32_000,
  maxEstimatedTokens: 1_000_000,
}

/** Error lanzado por {@link assertValidPlanV1} con todos los diagnósticos. */
export class PlanValidationError extends Error {
  /** Diagnósticos ordenados que hicieron fallar el plan. */
  readonly issues: readonly PlanValidationIssue[]

  /**
   * Construye un error estable para un conjunto de diagnósticos.
   * @param issues - diagnósticos producidos por el validador.
   */
  constructor(issues: readonly PlanValidationIssue[]) {
    super(issues.map(issue => `${issue.path}: ${issue.message}`).join('; '))
    this.name = 'PlanValidationError'
    this.issues = issues
  }
}

const COMPLEXITIES: readonly PlanComplexity[] = ['low', 'medium', 'high', 'critical']

interface PlanRecord {
  readonly [key: string]: unknown
}

interface ParsedTask {
  readonly task: PlanTaskV1
  readonly dependencies: readonly string[]
}

function isRecord(value: unknown): value is PlanRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isComplexity(value: unknown): value is PlanComplexity {
  return typeof value === 'string' && COMPLEXITIES.includes(value as PlanComplexity)
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function issue(
  code: PlanValidationIssue['code'],
  path: string,
  message: string,
  cycle?: readonly string[],
): PlanValidationIssue {
  return cycle === undefined ? { code, path, message } : { code, path, message, cycle }
}

function resolveLimits(options: PlanValidationOptions | undefined): PlanValidationLimits {
  const candidate = options?.limits ?? {}
  const limits: PlanValidationLimits = {
    ...DEFAULT_PLAN_VALIDATION_LIMITS,
    ...candidate,
  }
  const values = Object.values(limits)
  if (values.some(value => !Number.isSafeInteger(value) || value < 0)
    || limits.maxTasks < 1
    || limits.maxDepth < 1) {
    throw new RangeError('PlanValidationLimits debe contener enteros seguros no negativos; maxTasks y maxDepth deben ser positivos')
  }
  return limits
}

function validateStringList(
  value: unknown,
  path: string,
  code: PlanValidationIssue['code'],
  issues: PlanValidationIssue[],
): string[] | undefined {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    issues.push(issue(code, path, 'debe ser una lista de strings no vacíos'))
    return undefined
  }
  const entries: readonly unknown[] = value
  if (entries.some(entry => !isNonEmptyString(entry))) {
    issues.push(issue(code, path, 'debe ser una lista de strings no vacíos'))
    return undefined
  }
  return entries.map(entry => isNonEmptyString(entry) ? entry.trim() : '')
}

function validateScopes(
  scopes: readonly string[],
  path: string,
  allowed: ReadonlySet<string>,
  max: number,
  issues: PlanValidationIssue[],
): void {
  if (scopes.length > max) {
    issues.push(issue('limit-exceeded', path, `supera el límite de ${String(max)} scopes`))
  }
  const seen = new Set<string>()
  for (const [index, scope] of scopes.entries()) {
    if (seen.has(scope)) {
      issues.push(issue('duplicate-scope', `${path}[${String(index)}]`, `el scope "${scope}" está repetido`))
    }
    seen.add(scope)
    if (!allowed.has(scope)) {
      issues.push(issue('scope-not-allowed', `${path}[${String(index)}]`, `el scope "${scope}" no está autorizado por el plan`))
    }
  }
}

function parseTasks(
  value: unknown,
  planScopes: ReadonlySet<string>,
  limits: PlanValidationLimits,
  issues: PlanValidationIssue[],
): Map<string, ParsedTask> | undefined {
  if (!Array.isArray(value)) {
    issues.push(issue('invalid-tasks', 'tasks', 'debe ser una lista'))
    return undefined
  }
  if (value.length > limits.maxTasks) {
    issues.push(issue('limit-exceeded', 'tasks', `supera el límite de ${String(limits.maxTasks)} tareas`))
  }
  const tasks = new Map<string, ParsedTask>()
  for (const [index, rawTask] of value.entries()) {
    const path = `tasks[${String(index)}]`
    if (!isRecord(rawTask)) {
      issues.push(issue('invalid-task', path, 'debe ser un objeto'))
      continue
    }
    const id = rawTask.id
    const prompt = rawTask.prompt
    const complexity = rawTask.complexity
    if (!isNonEmptyString(id)) {
      issues.push(issue('invalid-id', `${path}.id`, 'debe ser un string no vacío'))
      continue
    }
    const normalizedId = id.trim()
    if (tasks.has(normalizedId)) {
      issues.push(issue('duplicate-task', `${path}.id`, `el identificador "${normalizedId}" está repetido`))
      continue
    }
    if (!isNonEmptyString(prompt)) {
      issues.push(issue('invalid-prompt', `${path}.prompt`, 'debe ser un string no vacío'))
    } else if (prompt.length > limits.maxPromptCharacters) {
      issues.push(issue('limit-exceeded', `${path}.prompt`, `supera el límite de ${String(limits.maxPromptCharacters)} caracteres`))
    }
    if (!isComplexity(complexity)) {
      issues.push(issue('invalid-complexity', `${path}.complexity`, 'debe ser low, medium, high o critical'))
    }
    const dependencies = validateStringList(rawTask.dependsOn, `${path}.dependsOn`, 'invalid-dependencies', issues)
    const scopes = validateStringList(rawTask.scopes, `${path}.scopes`, 'invalid-scopes', issues)
    if (dependencies === undefined || scopes === undefined || !isNonEmptyString(prompt) || !isComplexity(complexity)) {
      continue
    }
    if (dependencies.length > limits.maxDependenciesPerTask) {
      issues.push(issue('limit-exceeded', `${path}.dependsOn`, `supera el límite de ${String(limits.maxDependenciesPerTask)} dependencias`))
    }
    const dependencySet = new Set<string>()
    for (const [dependencyIndex, dependency] of dependencies.entries()) {
      if (dependencySet.has(dependency)) {
        issues.push(issue('duplicate-dependency', `${path}.dependsOn[${String(dependencyIndex)}]`, `la dependencia "${dependency}" está repetida`))
      }
      dependencySet.add(dependency)
      if (dependency === normalizedId) {
        issues.push(issue('cycle', `${path}.dependsOn[${String(dependencyIndex)}]`, 'una tarea no puede depender de sí misma', [normalizedId, normalizedId]))
      }
    }
    validateScopes(scopes, `${path}.scopes`, planScopes, limits.maxScopesPerTask, issues)
    const estimatedInputTokens = rawTask.estimatedInputTokens
    const estimatedOutputTokens = rawTask.estimatedOutputTokens
    if (estimatedInputTokens !== undefined && !isSafeNonNegativeInteger(estimatedInputTokens)) {
      issues.push(issue('invalid-task', `${path}.estimatedInputTokens`, 'debe ser un entero seguro no negativo'))
    }
    if (estimatedOutputTokens !== undefined && !isSafeNonNegativeInteger(estimatedOutputTokens)) {
      issues.push(issue('invalid-task', `${path}.estimatedOutputTokens`, 'debe ser un entero seguro no negativo'))
    }
    if ((estimatedInputTokens !== undefined && !isSafeNonNegativeInteger(estimatedInputTokens))
      || (estimatedOutputTokens !== undefined && !isSafeNonNegativeInteger(estimatedOutputTokens))) {
      continue
    }
    const task: PlanTaskV1 = {
      id: normalizedId,
      prompt,
      complexity,
      ...(dependencies.length > 0 ? { dependsOn: dependencies } : {}),
      ...(scopes.length > 0 ? { scopes } : {}),
      ...(estimatedInputTokens === undefined ? {} : { estimatedInputTokens }),
      ...(estimatedOutputTokens === undefined ? {} : { estimatedOutputTokens }),
    }
    tasks.set(normalizedId, { task, dependencies })
  }
  return tasks
}

function findCycle(tasks: ReadonlyMap<string, ParsedTask>): readonly string[] | undefined {
  const state = new Map<string, 0 | 1 | 2>()
  const stack: string[] = []
  const ids = [...tasks.keys()].sort()
  const visit = (id: string): readonly string[] | undefined => {
    state.set(id, 1)
    stack.push(id)
    const parsed = tasks.get(id)
    if (parsed !== undefined) {
      for (const dependency of [...parsed.dependencies].sort()) {
        const dependencyState = state.get(dependency) ?? 0
        if (dependencyState === 0) {
          const cycle = visit(dependency)
          if (cycle !== undefined) return cycle
        } else if (dependencyState === 1) {
          const start = stack.indexOf(dependency)
          return [...stack.slice(start), dependency]
        }
      }
    }
    stack.pop()
    state.set(id, 2)
    return undefined
  }
  for (const id of ids) {
    if ((state.get(id) ?? 0) === 0) {
      const cycle = visit(id)
      if (cycle !== undefined) return cycle
    }
  }
  return undefined
}

function orderTasks(tasks: ReadonlyMap<string, ParsedTask>): { order: string[]; levels: string[][]; depth: number } {
  const indegree = new Map<string, number>()
  const dependents = new Map<string, string[]>()
  for (const id of tasks.keys()) {
    indegree.set(id, 0)
    dependents.set(id, [])
  }
  for (const [id, parsed] of tasks) {
    indegree.set(id, parsed.dependencies.length)
    for (const dependency of parsed.dependencies) {
      dependents.get(dependency)?.push(id)
    }
  }
  const ready = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id).sort()
  const order: string[] = []
  const depths = new Map<string, number>()
  while (ready.length > 0) {
    const id = ready.shift()
    if (id === undefined) continue
    order.push(id)
    const currentDepth = depths.get(id) ?? 1
    depths.set(id, currentDepth)
    for (const dependent of [...(dependents.get(id) ?? [])].sort()) {
      depths.set(dependent, Math.max(depths.get(dependent) ?? 1, currentDepth + 1))
      const nextDegree = (indegree.get(dependent) ?? 1) - 1
      indegree.set(dependent, nextDegree)
      if (nextDegree === 0) {
        ready.push(dependent)
        ready.sort()
      }
    }
  }
  const levels: string[][] = []
  for (const id of order) {
    const level = depths.get(id) ?? 1
    const existingLevel = levels[level - 1]
    if (existingLevel === undefined) levels[level - 1] = [id]
    else existingLevel.push(id)
  }
  return { order, levels, depth: levels.length }
}

/**
 * Valida un valor contra PlanV1 y calcula su ejecución topológica.
 * @param value - valor recibido del productor del plan.
 * @param options - límites opcionales; omitirlos usa {@link DEFAULT_PLAN_VALIDATION_LIMITS}.
 * @returns Resultado válido con orden estable o diagnósticos ordenados.
 * @throws {RangeError} Si los límites suministrados no son enteros seguros positivos.
 */
export function validatePlanV1(value: unknown, options?: PlanValidationOptions): PlanValidationResult {
  const limits = resolveLimits(options)
  const issues: PlanValidationIssue[] = []
  if (!isRecord(value)) {
    return { ok: false, issues: [issue('invalid-plan', 'plan', 'debe ser un objeto')] }
  }
  if (value.version !== 1) issues.push(issue('invalid-version', 'version', 'debe ser exactamente 1'))
  if (!isNonEmptyString(value.id)) issues.push(issue('invalid-id', 'id', 'debe ser un string no vacío'))
  const planScopes = validateStringList(value.scopes, 'scopes', 'invalid-scopes', issues) ?? []
  if (planScopes.length > limits.maxScopesPerPlan) {
    issues.push(issue('limit-exceeded', 'scopes', `supera el límite de ${String(limits.maxScopesPerPlan)} scopes`))
  }
  const allowedScopes = new Set<string>()
  for (const [index, scope] of planScopes.entries()) {
    if (allowedScopes.has(scope)) issues.push(issue('duplicate-scope', `scopes[${String(index)}]`, `el scope "${scope}" está repetido`))
    allowedScopes.add(scope)
  }
  const tasks = parseTasks(value.tasks, allowedScopes, limits, issues)
  if (tasks === undefined || value.version !== 1 || !isNonEmptyString(value.id)) {
    return { ok: false, issues }
  }
  for (const [id, parsed] of tasks) {
    for (const [index, dependency] of parsed.dependencies.entries()) {
      if (!tasks.has(dependency)) {
        issues.push(issue('missing-dependency', `tasks.${id}.dependsOn[${String(index)}]`, `no existe la tarea "${dependency}"`))
      }
    }
  }
  const cycle = findCycle(tasks)
  if (cycle !== undefined) {
    issues.push(issue('cycle', 'tasks', `el DAG contiene un ciclo: ${cycle.join(' -> ')}`, cycle))
  }
  const ordered = cycle === undefined ? orderTasks(tasks) : undefined
  let estimatedTokens = 0
  for (const parsed of tasks.values()) {
    estimatedTokens += (parsed.task.estimatedInputTokens ?? 0) + (parsed.task.estimatedOutputTokens ?? 0)
  }
  if (estimatedTokens > limits.maxEstimatedTokens) {
    issues.push(issue('limit-exceeded', 'tasks', `los tokens previstos superan el límite de ${String(limits.maxEstimatedTokens)}`))
  }
  if (ordered !== undefined && ordered.depth > limits.maxDepth) {
    issues.push(issue('limit-exceeded', 'tasks', `la profundidad ${String(ordered.depth)} supera el límite de ${String(limits.maxDepth)}`))
  }
  if (issues.length > 0 || ordered === undefined) return { ok: false, issues }
  const plan: PlanV1 = {
    version: 1,
    id: value.id.trim(),
    ...(planScopes.length > 0 ? { scopes: planScopes } : {}),
    tasks: [...tasks.values()].map(parsed => parsed.task),
  }
  const result: ValidatedPlanV1 = {
    plan,
    executionOrder: ordered.order,
    levels: ordered.levels,
    depth: ordered.depth,
    estimatedTokens,
  }
  return { ok: true, value: result }
}

/**
 * Valida PlanV1 y convierte cualquier diagnóstico en una excepción tipada.
 * @param value - valor recibido del productor del plan.
 * @param options - límites opcionales del validador.
 * @returns Plan validado con orden topológico estable.
 * @throws {PlanValidationError} Si el plan no cumple el formato o sus límites.
 * @throws {RangeError} Si los límites suministrados no son válidos.
 */
export function assertValidPlanV1(value: unknown, options?: PlanValidationOptions): ValidatedPlanV1 {
  const result = validatePlanV1(value, options)
  if (!result.ok) throw new PlanValidationError(result.issues)
  return result.value
}
