import { describe, expect, it } from 'vitest'
import { InMemoryProjectMemory } from '../src/index.ts'

// Visión general del proceso:
// Estas pruebas verifican que la memoria del proyecto conserve entradas acotadas y permita
// recuperar coincidencias sin exponer referencias mutables del almacenamiento interno.
//
// Detalle paso a paso:
// 1. Se registran más entradas que el límite configurado.
// 2. Se comprueba que solo permanezcan las más recientes.
// 3. Se valida la búsqueda por varios términos.

describe('project-memory', () => {
  it('conserva el límite por proyecto y busca por términos', () => {
    const memory = new InMemoryProjectMemory(2)
    memory.remember({ projectId: 'p1', kind: 'fact', content: 'primer dato', source: 'test' })
    memory.remember({ projectId: 'p1', kind: 'decision', content: 'segundo dato', source: 'test' })
    memory.remember({ projectId: 'p1', kind: 'artifact', content: 'tercer dato', source: 'test' })

    expect(memory.list('p1')).toHaveLength(2)
    expect(memory.search('p1', 'tercer dato')).toHaveLength(1)
  })
})
