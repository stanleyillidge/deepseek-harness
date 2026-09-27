// Visión general del proceso:
// Este módulo define el servicio que posee las operaciones de proyectos. No
// implementa almacenamiento ni ejecución: proveedores concretos montan este
// servicio y el controller API lo expone mediante Remote.
//
// Detalle paso a paso:
// 1. Se registra `ctx.project` como el servicio de la capacidad.
// 2. Se reexportan los tipos compartidos por proveedores y consumidores.
// 3. Se declaran las operaciones que el controller puede delegar.

import { Context, Service } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
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
  ProjectId,
} from './types.ts'

export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Servicio Host que administra proyectos y sus ejecuciones. */
    project: ProjectService
  }
}

/** Definición del servicio que administra proyectos y runs. */
export abstract class ProjectService extends Service {
  constructor(ctx: Context) { super(ctx, 'project') }

  /**
   * Lista los proyectos visibles para el Host actual.
   * @returns resúmenes ordenados por el proveedor.
   */
  abstract list(): Promise<readonly ProjectSummary[]>

  /**
   * Crea un proyecto.
   * @param request - nombre, ruta e instrucciones iniciales.
   * @returns el proyecto creado.
   */
  abstract create(request: ProjectCreateRequest): Promise<Project>

  /**
   * Abre un proyecto existente.
   * @param request - identidad del proyecto.
   * @returns el proyecto con sus instrucciones.
   */
  abstract open(request: ProjectOpenRequest): Promise<Project>

  /**
   * Actualiza las instrucciones del proyecto.
   * @param request - identidad y nuevo contenido.
   * @returns el proyecto actualizado.
   */
  abstract updateInstructions(request: ProjectInstructionsUpdateRequest): Promise<Project>

  /**
   * Inicia un run para el proyecto.
   * @param request - proyecto y prompt opcional.
   * @returns la ejecución admitida.
   */
  abstract startRun(request: ProjectRunRequest): Promise<ProjectRun>

  /**
   * Consulta el estado del proyecto.
   * @param request - identidad del proyecto.
   * @returns estado del proyecto y sus runs conocidos.
   */
  abstract getStatus(request: ProjectStatusRequest): Promise<ProjectStatus>
}

export {
  ProjectClosedError,
  ProjectCorruptionError,
  ProjectDuplicateWorkspaceError,
  ProjectError,
  ProjectInvariantError,
  ProjectNotFoundError,
  ProjectRevisionConflictError,
  ProjectValidationError,
} from './errors.ts'
export {
  validateProjectRecord,
  validateProjectRun,
  validateProjectSnapshot,
  validateProjectTask,
  validateWorker,
} from './validator.ts'
export { assertProjectInvariants } from './invariants.ts'
export { openProjectRepository, SqliteProjectRepository } from './sqlite.ts'

/**
 * Marca un string como `ProjectId` para las entradas de repositorio.
 * @param id - Identificador no vacío proveniente de una fuente confiable.
 * @returns el mismo valor con la marca estática de Projects.
 */
export function ProjectId(id: string): ProjectId {
  return brandString<ProjectId>(id)
}

export default ProjectService
