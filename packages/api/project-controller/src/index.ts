// Visión general del proceso:
// Este controller registra el namespace Remote `project` y delega cada endpoint
// al servicio `ctx.project`, manteniendo la validación y la ejecución en el seam
// de dominio que posee los proyectos.
//
// Detalle paso a paso:
// 1. Se declara la dependencia del servicio `project` para que Cordis espere su montaje.
// 2. Se publican las seis operaciones del ciclo de proyecto mediante Typert.
// 3. Se conserva sin cambios el valor o el error que devuelva el servicio.

import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-project'
import type { ProjectService } from '@deepseek-ai/dsh-project'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  Project,
  ProjectCreateRequest,
  ProjectInstructionsUpdateRequest,
  ProjectOpenRequest,
  ProjectRun,
  ProjectRunRequest,
  ProjectStatus,
  ProjectStatusRequest,
  ProjectSummary,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Propietario Host del namespace Remote `project`. */
    projectController: ProjectController
  }
}

/** Servicio Remote que expone las operaciones del seam de proyectos. */
export class ProjectController extends TypertRemoteService {
  static inject = ['project', 'typert']

  /**
   * @param ctx - contexto Host que contiene `ctx.project`.
   */
  constructor(ctx: Context) {
    super(ctx, 'projectController', { namespace: 'project' })
  }

  /**
   * Lista los proyectos visibles para el Host.
   * @returns resúmenes de proyectos en el orden del servicio de dominio.
   */
  @Remote('list')
  list(): Promise<readonly ProjectSummary[]> {
    return this.service().list()
  }

  /**
   * Crea un proyecto.
   * @param request - datos iniciales del proyecto.
   * @returns el proyecto creado.
   */
  @Remote('create')
  create(request: ProjectCreateRequest): Promise<Project> {
    return this.service().create(request)
  }

  /**
   * Abre un proyecto existente.
   * @param request - identidad del proyecto.
   * @returns el proyecto con sus instrucciones.
   */
  @Remote('open')
  open(request: ProjectOpenRequest): Promise<Project> {
    return this.service().open(request)
  }

  /**
   * Actualiza las instrucciones de un proyecto.
   * @param request - identidad y nuevo contenido.
   * @returns el proyecto actualizado.
   */
  @Remote('updateInstructions')
  updateInstructions(request: ProjectInstructionsUpdateRequest): Promise<Project> {
    return this.service().updateInstructions(request)
  }

  /**
   * Inicia un run para un proyecto.
   * @param request - identidad y prompt opcional.
   * @returns la ejecución admitida.
   */
  @Remote('startRun')
  startRun(request: ProjectRunRequest): Promise<ProjectRun> {
    return this.service().startRun(request)
  }

  /**
   * Consulta el estado actual de un proyecto.
   * @param request - identidad del proyecto.
   * @returns estado y runs conocidos.
   */
  @Remote('getStatus')
  getStatus(request: ProjectStatusRequest): Promise<ProjectStatus> {
    return this.service().getStatus(request)
  }

  /** Obtiene el servicio de dominio o deja que Cordis informe la ausencia. */
  private service(): ProjectService { return this.ctx.project }
}

export default ProjectController
