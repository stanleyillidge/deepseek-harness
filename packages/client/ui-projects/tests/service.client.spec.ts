import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { UiProjectsService } from '../src/client/service.ts'

describe('UiProjectsService', () => {
  it('registra, ordena y libera entradas de navegación', async () => {
    const ctx = new Context()
    await ctx.plugin(UiProjectsService).await()
    const service = ctx.get('uiProjects') as UiProjectsService
    const first = { id: 'projects', order: 20, onSelect: vi.fn() }
    const second = { id: 'home', order: 10, onSelect: vi.fn() }
    const removeFirst = service.registerNavigation(first)
    service.registerNavigation(second)

    expect(service.navigation().map(entry => entry.id)).toEqual(['home', 'projects'])
    expect(() => service.registerNavigation(first)).toThrow(/already registered/)
    removeFirst()
    removeFirst()
    expect(service.navigation().map(entry => entry.id)).toEqual(['home'])
  })
})
