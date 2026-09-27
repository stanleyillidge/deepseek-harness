import { describe, expect, it } from 'vitest'
import { buildProjectContext } from '../src/index.ts'

// Visión general del proceso:
// Estas pruebas verifican que el ensamblador respete el presupuesto de caracteres y mantenga
// un orden estable entre instrucciones, repositorios y memoria autorizada.
//
// Detalle paso a paso:
// 1. Se construye un contexto con varias fuentes.
// 2. Se fija un presupuesto menor que el contenido completo.
// 3. Se comprueba el truncamiento y el límite resultante.

describe('project-context', () => {
  it('respeta el presupuesto y conserva el orden de las secciones', () => {
    const result = buildProjectContext({
      instructions: 'instrucciones',
      userInstruction: 'solicitud',
      repositories: [{ name: 'repo', status: 'clean', branch: 'main' }],
      memory: [{ kind: 'fact', content: 'dato', source: 'test' }],
      maxCharacters: 24,
    })

    expect(result.characterCount).toBeLessThanOrEqual(24)
    expect(result.sections[0]).toBe('instrucciones')
    expect(result.truncated).toBe(true)
  })
})
