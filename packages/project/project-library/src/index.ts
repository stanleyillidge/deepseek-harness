// Visión general del proceso:
// Este módulo registra recursos reutilizables del proyecto y ofrece búsqueda textual acotada.
// No ejecuta skills ni inyecta contenido en modelos sin que un consumidor lo solicite.
//
// Detalle paso a paso:
// 1. `register` valida identidad y conserva una copia del recurso.
// 2. `list` y `search` devuelven snapshots sin alias mutables.
// 3. Los duplicados se rechazan para mantener una fuente única por identidad.

/** Tipo de recurso disponible para un proyecto. */
export type ProjectLibraryKind = 'skill' | 'template' | 'reference' | 'checklist'

/** Recurso registrado en la biblioteca. */
export interface ProjectLibraryEntry {
  readonly id: string
  readonly projectId: string
  readonly name: string
  readonly kind: ProjectLibraryKind
  readonly content: string
  readonly tags: readonly string[]
  readonly updatedAt: string
}

/** Biblioteca en memoria para el primer vertical slice. */
export class ProjectLibrary {
  private readonly entries = new Map<string, ProjectLibraryEntry>()

  register(input: Omit<ProjectLibraryEntry, 'updatedAt'>): ProjectLibraryEntry {
    if (this.entries.has(input.id)) throw new Error(`library entry '${input.id}' already exists`)
    if (input.id.trim() === '' || input.projectId.trim() === '' || input.name.trim() === '' || input.content.trim() === '') throw new TypeError('library entry fields must be non-empty')
    const entry = { ...input, tags: [...input.tags], updatedAt: new Date().toISOString() }
    this.entries.set(entry.id, entry)
    return { ...entry, tags: [...entry.tags] }
  }

  list(projectId: string): readonly ProjectLibraryEntry[] {
    return [...this.entries.values()].filter(entry => entry.projectId === projectId).map(entry => ({ ...entry, tags: [...entry.tags] }))
  }

  search(projectId: string, query: string, limit = 20): readonly ProjectLibraryEntry[] {
    const term = query.trim().toLocaleLowerCase()
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('limit must be positive')
    return this.list(projectId).filter(entry => `${entry.name} ${entry.content} ${entry.tags.join(' ')}`.toLocaleLowerCase().includes(term)).slice(0, limit)
  }
}
