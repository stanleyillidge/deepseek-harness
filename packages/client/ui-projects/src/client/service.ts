import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'

/** Entrada de navegación que una composición puede añadir al menú principal. */
export interface ProjectsNavigationEntry {
  /** Identificador estable de la entrada. */
  readonly id: string
  /** Orden relativo dentro del menú consumidor. */
  readonly order?: number
  /** Acción que abre la superficie de Proyectos. */
  readonly onSelect: () => void
}

/**
 * Servicio aislado para conectar la UI de Proyectos con una navegación host.
 * No posee datos de negocio: el propietario de la aplicación conserva los
 * proyectos y entrega sus snapshots y callbacks a `ProjectsPage`.
 */
export interface UiProjectsServiceContract {
  /** Registra una entrada de navegación y devuelve su desregistrador. */
  registerNavigation(entry: ProjectsNavigationEntry): () => void
  /** Lee las entradas registradas en orden de prioridad y registro. */
  navigation(): readonly ProjectsNavigationEntry[]
  /** Suscribe un consumidor a cambios del registro. */
  subscribe(listener: () => void): () => void
}

interface UiProjectsState {
  readonly navigation: ProjectsNavigationEntry[]
  readonly listeners: Set<() => void>
}

/** Implementación Cordis del contrato `ctx.uiProjects`. */
export class UiProjectsService extends Service implements UiProjectsServiceContract {
  private readonly state: UiProjectsState = { navigation: [], listeners: new Set() }

  /**
   * @param ctx - contexto que posee el servicio.
   */
  constructor(ctx: Context) {
    super(ctx, 'uiProjects')
  }

  registerNavigation(entry: ProjectsNavigationEntry): () => void {
    if (this.state.navigation.some(candidate => candidate.id === entry.id)) {
      throw new Error(`ui-projects: navigation entry "${entry.id}" is already registered`)
    }
    this.state.navigation.push(entry)
    this.publish()
    return () => {
      const index = this.state.navigation.indexOf(entry)
      if (index < 0) return
      this.state.navigation.splice(index, 1)
      this.publish()
    }
  }

  navigation(): readonly ProjectsNavigationEntry[] {
    return [...this.state.navigation].sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
  }

  subscribe(listener: () => void): () => void {
    this.state.listeners.add(listener)
    return () => { this.state.listeners.delete(listener) }
  }

  private publish(): void {
    for (const listener of [...this.state.listeners]) listener()
  }
}
