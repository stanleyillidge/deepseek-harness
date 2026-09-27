/**
 * Errores públicos de Projects. Cada operación conserva un código estable y
 * los datos necesarios para que el consumidor pueda decidir si reintenta,
 * corrige la entrada o muestra una corrupción persistida.
 * @module @deepseek-ai/dsh-project/errors
 */

import type { ProjectId, ProjectRecord } from './types.ts'

/** Códigos de fallo que forman parte de la API del repositorio. */
export type ProjectErrorCode =
  | 'PROJECT_MODEL_UNAVAILABLE'
  | 'PROJECT_MODEL_BUDGET_EXCEEDED'
  | 'PROJECT_RESOURCE_BUSY'
  | 'invalid-input'
  | 'duplicate-workspace'
  | 'not-found'
  | 'revision-conflict'
  | 'corrupted-storage'
  | 'invariant-violation'
  | 'closed'

/** Error base con un discriminante apto para manejo programático. */
export class ProjectError extends Error {
  override readonly name: string = 'ProjectError'

  /**
   * @param message - Diagnóstico legible para el operador.
   * @param code - Clase estable del fallo.
   * @param details - Metadatos opcionales para consumidores existentes.
   * @param options - Causa original cuando existe.
   */
  constructor(
    message: string,
    readonly code: ProjectErrorCode,
    readonly details?: Readonly<Record<string, string>>,
    options?: ErrorOptions,
  ) {
    super(message, options)
  }
}

/** Entrada de proyecto o snapshot que no cumple el validador. */
export class ProjectValidationError extends ProjectError {
  override readonly name = 'ProjectValidationError'

  /**
   * @param message - Campo o regla que no cumple la entrada.
   * @param options - Causa de validación original.
   */
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'invalid-input', undefined, options)
  }
}

/** El workspace ya pertenece a otro proyecto. */
export class ProjectDuplicateWorkspaceError extends ProjectError {
  override readonly name = 'ProjectDuplicateWorkspaceError'

  /**
   * @param workspace - Workspace que causó el conflicto.
   * @param projectId - Proyecto que ya lo posee, si pudo resolverse.
   */
  constructor(readonly workspace: string, readonly projectId?: ProjectId) {
    super(`workspace '${workspace}' ya pertenece a un proyecto`, 'duplicate-workspace')
  }
}

/** El identificador solicitado no existe. */
export class ProjectNotFoundError extends ProjectError {
  override readonly name = 'ProjectNotFoundError'

  /**
   * @param projectId - Proyecto que no se encontró.
   */
  constructor(readonly projectId: ProjectId) {
    super(`proyecto '${projectId}' no existe`, 'not-found')
  }
}

/** La escritura compare-and-set observó una revisión antigua. */
export class ProjectRevisionConflictError extends ProjectError {
  override readonly name = 'ProjectRevisionConflictError'

  /**
   * @param projectId - Proyecto que cambió.
   * @param expectedRevision - Revisión entregada por el llamador.
   * @param current - Estado autoritativo actual.
   */
  constructor(
    readonly projectId: ProjectId,
    readonly expectedRevision: number,
    readonly current: ProjectRecord,
  ) {
    super(`proyecto '${projectId}' está en revisión ${current.revision}; se esperaba ${expectedRevision}`, 'revision-conflict')
  }
}

/** El medio contiene un payload que no puede validarse. */
export class ProjectCorruptionError extends ProjectError {
  override readonly name = 'ProjectCorruptionError'

  /**
   * @param table - Tabla física que contiene el payload inválido.
   * @param key - Clave física del registro inválido.
   * @param options - Error de parseo o validación original.
   */
  constructor(readonly table: string, readonly key: string, options: ErrorOptions) {
    super(`registro corrupto en '${table}' con clave '${key}'`, 'corrupted-storage', undefined, options)
  }
}

/** La conexión fue cerrada antes de completar la operación. */
export class ProjectClosedError extends ProjectError {
  override readonly name = 'ProjectClosedError'

  constructor() {
    super('el repositorio de proyectos está cerrado', 'closed')
  }
}

/** Una relación entre tablas contradice el estado persistido. */
export class ProjectInvariantError extends ProjectError {
  override readonly name = 'ProjectInvariantError'

  /**
   * @param message - Relación que dejó de ser válida.
   */
  constructor(message: string) {
    super(message, 'invariant-violation')
  }
}
