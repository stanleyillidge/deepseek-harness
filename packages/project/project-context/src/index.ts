// Visión general del proceso:
// Este módulo ensambla contexto de proyecto con un límite explícito de caracteres. No llama a
// modelos, no lee archivos y no decide permisos; recibe snapshots ya autorizados del consumidor.
//
// Detalle paso a paso:
// 1. Se normalizan instrucciones, memoria y resumen de repositorios.
// 2. Se agregan secciones en orden estable hasta alcanzar el presupuesto.
// 3. Se devuelve texto y metadatos suficientes para auditoría y presentación.

/** Registro de memoria que puede entrar en el contexto. */
export interface ProjectContextMemory { readonly kind: string; readonly content: string; readonly source: string }

/** Resumen de repositorio ya inspeccionado por un provider autorizado. */
export interface ProjectContextRepository {
  readonly name: string
  readonly branch?: string
  readonly status: 'clean' | 'dirty' | 'unknown'
}

/** Entrada completa para ensamblar contexto. */
export interface ProjectContextInput {
  readonly instructions: string
  readonly userInstruction: string
  readonly memory?: readonly ProjectContextMemory[]
  readonly repositories?: readonly ProjectContextRepository[]
  readonly maxCharacters: number
}

/** Contexto final con secciones y tamaño medible. */
export interface ProjectContext {
  readonly text: string
  readonly sections: readonly string[]
  readonly characterCount: number
  readonly truncated: boolean
}

/** Ensambla contexto estable y nunca supera `maxCharacters`. */
export function buildProjectContext(input: ProjectContextInput): ProjectContext {
  if (!Number.isSafeInteger(input.maxCharacters) || input.maxCharacters < 1) throw new RangeError('maxCharacters debe ser un entero positivo')
  const candidates = [
    input.instructions.trim(),
    input.userInstruction.trim(),
    ...(input.repositories ?? []).map(repository => `Repositorio ${repository.name}: ${repository.status}${repository.branch === undefined ? '' : ` en ${repository.branch}`}`),
    ...(input.memory ?? []).map(memory => `Memoria [${memory.kind}] (${memory.source}): ${memory.content.trim()}`),
  ].filter(section => section !== '')
  const sections: string[] = []
  let characterCount = 0
  let truncated = false
  for (const candidate of candidates) {
    const separator = sections.length === 0 ? 0 : 2
    const remaining = input.maxCharacters - characterCount - separator
    if (remaining <= 0) { truncated = true; break }
    if (candidate.length <= remaining) {
      sections.push(candidate)
      characterCount += separator + candidate.length
    } else {
      sections.push(candidate.slice(0, remaining).trimEnd())
      characterCount = input.maxCharacters
      truncated = true
      break
    }
  }
  return { text: sections.join('\n\n'), sections, characterCount, truncated }
}
