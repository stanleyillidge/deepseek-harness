import { describe, expect, it } from 'vitest'
import { escalateModelRoute, selectModelRoute } from '../src/index.ts'

const request = {
  complexity: 'medium' as const,
  requiredContextTokens: 4_000,
  estimatedTokens: 1_000,
  now: 1_000,
}

describe('project-model-router', () => {
  it('elige cheapest-first entre candidatos elegibles', () => {
    const result = selectModelRoute(request, {
      candidates: [
        { id: 'large', maxComplexity: 'high', contextWindowTokens: 16_000, cost: 3 },
        { id: 'cheap', maxComplexity: 'medium', contextWindowTokens: 8_000, cost: 1 },
        { id: 'small-context', maxComplexity: 'medium', contextWindowTokens: 2_000, cost: 0 },
      ],
    })

    expect(result.kind).toBe('selected')
    if (result.kind === 'selected') expect(result.route).toEqual({ modelId: 'cheap', escalation: 0 })
  })

  it('descarta complejidad, capacidad, cuota y cooldown antes de ordenar', () => {
    const result = selectModelRoute(request, {
      candidates: [
        { id: 'complexity', maxComplexity: 'low', contextWindowTokens: 8_000, cost: 0 },
        { id: 'capacity', maxComplexity: 'medium', contextWindowTokens: 2_000, cost: 0 },
        { id: 'quota', maxComplexity: 'medium', contextWindowTokens: 8_000, cost: 0, quota: { remainingRequests: 1, remainingTokens: 999 } },
        { id: 'cooldown', maxComplexity: 'medium', contextWindowTokens: 8_000, cost: 0, cooldownUntil: 1_001 },
      ],
    })

    expect(result.kind).toBe('unavailable')
    if (result.kind === 'unavailable') {
      expect(result.considered).toEqual([
        { modelId: 'complexity', reason: 'complexity' },
        { modelId: 'capacity', reason: 'capacity' },
        { modelId: 'quota', reason: 'quota' },
        { modelId: 'cooldown', reason: 'cooldown' },
      ])
    }
  })

  it('escala a una complejidad superior y no repite la ruta anterior', () => {
    const inventory = {
      candidates: [
        { id: 'medium', maxComplexity: 'medium' as const, contextWindowTokens: 8_000, cost: 1 },
        { id: 'high', maxComplexity: 'high' as const, contextWindowTokens: 16_000, cost: 4 },
        { id: 'critical', maxComplexity: 'critical' as const, contextWindowTokens: 32_000, cost: 9 },
      ],
    }
    const first = selectModelRoute(request, inventory)
    expect(first.kind).toBe('selected')
    if (first.kind !== 'selected') return

    const next = escalateModelRoute(request, inventory, first.route)
    expect(next.kind).toBe('selected')
    if (next.kind === 'selected') expect(next.route).toEqual({ modelId: 'high', escalation: 1 })
  })

  it('mantiene desempates deterministas por identificador y acepta cooldown vencido', () => {
    const result = selectModelRoute({ ...request, now: 2_000 }, {
      candidates: [
        { id: 'zeta', maxComplexity: 'medium', contextWindowTokens: 8_000, cost: 1, cooldownUntil: 2_000 },
        { id: 'alfa', maxComplexity: 'medium', contextWindowTokens: 8_000, cost: 1 },
      ],
    })

    expect(result.kind).toBe('selected')
    if (result.kind === 'selected') expect(result.route.modelId).toBe('alfa')
  })
})
