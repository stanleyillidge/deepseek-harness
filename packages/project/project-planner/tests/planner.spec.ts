import { describe, expect, it } from 'vitest'
import { assertValidPlanV1, PlanValidationError, validatePlanV1 } from '../src/index.ts'

describe('project-planner', () => {
  it('ordena un DAG válido de forma estable y calcula niveles', () => {
    const result = validatePlanV1({
      version: 1,
      id: 'plan-a',
      scopes: ['repo:read'],
      tasks: [
        { id: 'final', prompt: 'final', complexity: 'medium', dependsOn: ['b', 'a'], scopes: ['repo:read'] },
        { id: 'b', prompt: 'b', complexity: 'low', dependsOn: ['a'], scopes: ['repo:read'] },
        { id: 'a', prompt: 'a', complexity: 'low', scopes: ['repo:read'] },
      ],
    })

    expect(result).toEqual({
      ok: true,
      value: {
        plan: {
          version: 1,
          id: 'plan-a',
          scopes: ['repo:read'],
          tasks: [
            { id: 'final', prompt: 'final', complexity: 'medium', dependsOn: ['b', 'a'], scopes: ['repo:read'] },
            { id: 'b', prompt: 'b', complexity: 'low', dependsOn: ['a'], scopes: ['repo:read'] },
            { id: 'a', prompt: 'a', complexity: 'low', scopes: ['repo:read'] },
          ],
        },
        executionOrder: ['a', 'b', 'final'],
        levels: [['a'], ['b'], ['final']],
        depth: 3,
        estimatedTokens: 0,
      },
    })
  })

  it('rechaza ciclos, dependencias inexistentes y scopes no autorizados', () => {
    const result = validatePlanV1({
      version: 1,
      id: 'invalid',
      scopes: ['repo:read'],
      tasks: [
        { id: 'a', prompt: 'a', complexity: 'low', dependsOn: ['b', 'missing'], scopes: ['repo:write'] },
        { id: 'b', prompt: 'b', complexity: 'low', dependsOn: ['a'] },
      ],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map(issue => issue.code)).toEqual([
      'scope-not-allowed',
      'missing-dependency',
      'cycle',
    ])
    expect(result.issues[2]?.cycle).toEqual(['a', 'b', 'a'])
  })

  it('aplica límites de tareas, dependencias, profundidad y tokens', () => {
    const result = validatePlanV1({
      version: 1,
      id: 'bounded',
      tasks: [
        { id: 'a', prompt: 'a', complexity: 'low', estimatedInputTokens: 4 },
        { id: 'b', prompt: 'b', complexity: 'low', dependsOn: ['a'], estimatedOutputTokens: 4 },
      ],
    }, {
      limits: {
        maxTasks: 1,
        maxDependenciesPerTask: 0,
        maxDepth: 1,
        maxEstimatedTokens: 7,
        maxScopesPerPlan: 1,
        maxScopesPerTask: 1,
        maxPromptCharacters: 4,
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.map(issue => issue.code)).toEqual([
      'limit-exceeded',
      'limit-exceeded',
      'limit-exceeded',
      'limit-exceeded',
    ])
  })

  it('expone todos los diagnósticos mediante PlanValidationError', () => {
    expect(() => assertValidPlanV1({ version: 2, id: '', tasks: [] })).toThrow(PlanValidationError)
    try {
      assertValidPlanV1({ version: 2, id: '', tasks: [] })
    } catch (error) {
      expect(error).toBeInstanceOf(PlanValidationError)
      expect((error as PlanValidationError).issues.map(issue => issue.code)).toEqual(['invalid-version', 'invalid-id'])
    }
  })
})
