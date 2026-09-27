// Visión general del proceso:
// Este módulo conserva memoria acotada por proyecto sin decidir cómo se persiste ni cómo se
// muestra al modelo. La implementación incluida es determinista y reemplazable por SQLite.
//
// Detalle paso a paso:
// 1. `remember` valida y normaliza una entrada antes de publicarla.
// 2. El límite conserva solo la memoria más reciente para evitar crecimiento ilimitado.
// 3. `search` filtra por términos completos y devuelve copias inmutables en orden estable.

import { randomUUID } from 'node:crypto'

/** Clase de memoria que orienta la recuperación posterior. */
export type ProjectMemoryKind = 'fact' | 'decision' | 'constraint' | 'artifact'

/** Registro de memoria asociado a un proyecto. */
export interface ProjectMemoryEntry {
  readonly id: string
  readonly projectId: string
  readonly kind: ProjectMemoryKind
  readonly content: string
  readonly source: string
  readonly createdAt: string
}

/** Entrada sin campos generados por el store. */
export interface ProjectMemoryInput {
  readonly projectId: string
  readonly kind: ProjectMemoryKind
  readonly content: string
  readonly source: string
}

/** Store mínimo que puede sustituirse por persistencia duradera. */
export interface ProjectMemoryStore {
  remember(input: ProjectMemoryInput): ProjectMemoryEntry
  list(projectId: string): readonly ProjectMemoryEntry[]
  search(projectId: string, query: string, limit?: number): readonly ProjectMemoryEntry[]
}

/** Store de memoria acotado y determinista para el primer vertical slice. */
export class InMemoryProjectMemory implements ProjectMemoryStore {
  private readonly entries = new Map<string, ProjectMemoryEntry[]>()

  constructor(private readonly maxEntriesPerProject = 256) {
    if (!Number.isSafeInteger(maxEntriesPerProject) || maxEntriesPerProject < 1) {
      throw new RangeError('maxEntriesPerProject debe ser un entero positivo')
    }
  }

  remember(input: ProjectMemoryInput): ProjectMemoryEntry {
    const content = input.content.trim()
    const source = input.source.trim()
    if (input.projectId.trim() === '' || content === '' || source === '') throw new TypeError('la memoria requiere proyecto, contenido y origen')
    const entry: ProjectMemoryEntry = {
      id: randomUUID(),
      projectId: input.projectId,
      kind: input.kind,
      content,
      source,
      createdAt: new Date().toISOString(),
    }
    const current = this.entries.get(input.projectId) ?? []
    this.entries.set(input.projectId, [...current, entry].slice(-this.maxEntriesPerProject))
    return entry
  }

  list(projectId: string): readonly ProjectMemoryEntry[] {
    return (this.entries.get(projectId) ?? []).map(entry => ({ ...entry }))
  }

  search(projectId: string, query: string, limit = 20): readonly ProjectMemoryEntry[] {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('limit debe ser un entero positivo')
    const terms = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean)
    return this.list(projectId).filter((entry) => {
      const haystack = `${entry.content} ${entry.source}`.toLocaleLowerCase()
      return terms.every(term => haystack.includes(term))
    }).slice(-limit).reverse()
  }
}
