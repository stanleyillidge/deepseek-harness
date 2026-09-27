import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, es, zh } from './locales.ts'
import { UiProjectsService } from './service.ts'

export { ProjectsPage } from './ProjectsPage.tsx'
export type {
  Project, ProjectId, ProjectRun, ProjectRunStatus, ProjectStatus, ProjectTab, ProjectsPageProps, ProjectsPageState,
} from './ProjectsPage.tsx'
export { UiProjectsService } from './service.ts'
export type { ProjectsNavigationEntry, UiProjectsServiceContract } from './service.ts'
export type { ProjectsKey } from './locales.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Servicio aislado de navegación de la superficie Proyectos. */
    uiProjects: import('./service.ts').UiProjectsServiceContract
  }
}

/** Espacio de nombres de los diccionarios de esta superficie. */
export const NS = 'projects'

/** Servicios requeridos: registro de copy y servicio Cordis propio. */
export const inject = ['locale']

/**
 * Registra locale y el servicio aislado de navegación.
 * @param ctx - contexto Cordis del cliente.
 */
export function apply(ctx: ClientContext): void {
  ctx.plugin(UiProjectsService)
  ctx.effect(() => ctx.locale.register(NS, { zh, en, es }), 'ui-projects: dictionaries')
}
