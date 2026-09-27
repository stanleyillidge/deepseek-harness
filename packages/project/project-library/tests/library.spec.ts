import { describe, expect, it } from 'vitest'
import { ProjectLibrary } from '../src/index.ts'

// Visión general del proceso:
// Estas pruebas verifican el registro único y la búsqueda acotada de recursos reutilizables.
//
// Detalle paso a paso:
// 1. Se registra un recurso para un proyecto.
// 2. Se intenta registrar la misma identidad para confirmar el rechazo.
// 3. Se consulta el recurso mediante una coincidencia textual.

describe('project-library', () => {
  it('registra recursos únicos y permite buscarlos', () => {
    const library = new ProjectLibrary()
    library.register({ id: 'skill-1', projectId: 'p1', name: 'Guía', kind: 'skill', content: 'validar cambios', tags: ['git'] })

    expect(library.search('p1', 'validar')).toHaveLength(1)
    expect(() => library.register({ id: 'skill-1', projectId: 'p1', name: 'Otra', kind: 'skill', content: 'contenido', tags: [] })).toThrow(/already exists/u)
  })
})
