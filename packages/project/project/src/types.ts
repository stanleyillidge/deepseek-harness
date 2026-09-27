// Visión general del proceso:
// Este archivo concentra los tipos que cruzan el seam de proyectos y que el
// controller API reutiliza sin duplicar contratos ni introducir lógica de ejecución.
//
// Detalle paso a paso:
// 1. Se identifican proyectos y runs con tipos opacos.
// 2. Se describen las solicitudes de lectura y mutación del proyecto.
// 3. Se exponen las vistas que el servicio y el controller devuelven al cliente.

/** Identidad opaca de un proyecto persistido. */
import type { Branded } from '@deepseek-ai/dsh-brand'

export type ProjectId = Branded<'ProjectId'>

/** Identidad opaca de una ejecución iniciada para un proyecto. */
export type ProjectRunId = Branded<'ProjectRunId'>

/** Resumen estable que aparece en el listado de proyectos. */
export interface ProjectSummary {
  readonly id: ProjectId
  readonly name: string
  readonly path: string
  readonly updatedAt: number
}

/** Proyecto abierto, incluyendo las instrucciones editables. */
export interface Project extends ProjectSummary {
  readonly instructions: string
}

/** Estado terminal o activo de una ejecución de proyecto. */
export type ProjectRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

/** Vista de una ejecución iniciada desde el controller. */
export interface ProjectRun {
  readonly id: ProjectRunId
  readonly projectId: ProjectId
  readonly status: ProjectRunStatus
  /** Worker asignado, cuando la ejecución ya fue adjudicada. */
  readonly workerId?: WorkerId
  readonly startedAt?: number
  readonly finishedAt?: number
  readonly error?: string
}

/** Estado actual del proyecto y de su última ejecución conocida. */
export interface ProjectStatus {
  readonly project: ProjectSummary
  readonly activeRun?: ProjectRun
  readonly lastRun?: ProjectRun
}

/** Datos necesarios para crear un proyecto. */
export interface ProjectCreateRequest {
  readonly name: string
  readonly path: string
  readonly instructions?: string
}

/** Identifica el proyecto que debe abrirse. */
export interface ProjectOpenRequest {
  readonly projectId: ProjectId
}

/** Reemplaza las instrucciones del proyecto. */
export interface ProjectInstructionsUpdateRequest {
  readonly projectId: ProjectId
  readonly instructions: string
}

/** Inicia un run con el contexto opcional que aporta el caller. */
export interface ProjectRunRequest {
  readonly projectId: ProjectId
  readonly prompt?: string
}

/** Solicita el estado actual de un proyecto. */
export interface ProjectStatusRequest {
  readonly projectId: ProjectId
}

/** Registro durable de un proyecto administrado por el repositorio. */
export interface ProjectRecord {
  /** Identidad estable del proyecto. */
  readonly id: ProjectId
  /** Workspace lógico único que posee el proyecto. */
  readonly workspace: string
  /** Nombre visible del proyecto. */
  readonly name: string
  /** Descripción opcional del proyecto. */
  readonly description?: string
  /** Instante de creación en formato ISO-8601. */
  readonly createdAt: string
  /** Instante de la última modificación en formato ISO-8601. */
  readonly updatedAt: string
  /** Revisión monotónica para actualizaciones compare-and-set. */
  readonly revision: number
}

/** Identidad opaca de una tarea persistida. */
export type ProjectTaskId = Branded<'ProjectTaskId'>

/** Identidad opaca de un worker registrado. */
export type WorkerId = Branded<'WorkerId'>

/** Estados de planificación de una tarea. */
export type ProjectTaskStatus = 'todo' | 'in_progress' | 'completed' | 'blocked'

/** Estado operativo de un worker. */
export type WorkerStatus = 'idle' | 'busy' | 'offline'

/** Tarea persistida que pertenece a un proyecto. */
export interface ProjectTask {
  readonly id: ProjectTaskId
  readonly projectId: ProjectId
  readonly title: string
  readonly status: ProjectTaskStatus
  readonly createdAt: string
  readonly updatedAt: string
}

/** Worker disponible para ejecutar runs. */
export interface Worker {
  readonly id: WorkerId
  readonly name: string
  readonly status: WorkerStatus
  readonly capabilities: readonly string[]
  readonly lastSeenAt: string
}

/** Datos para crear un registro de proyecto. */
export interface ProjectRecordCreateInput {
  readonly workspace: string
  readonly name: string
  readonly description?: string
}

/** Campos modificables de un registro de proyecto. */
export interface ProjectRecordUpdateInput {
  readonly workspace?: string
  readonly name?: string
  readonly description?: string | null
}

/** Alias de entrada de creación para consumidores que no distinguen el record persistido. */
export type ProjectCreateInput = ProjectRecordCreateInput

/** Alias de entrada de actualización para consumidores que no distinguen el record persistido. */
export type ProjectUpdateInput = ProjectRecordUpdateInput

/** Datos para crear un run durable. */
export interface ProjectRunCreateInput {
  readonly projectId: ProjectId
  readonly status?: ProjectRunStatus
  readonly workerId?: WorkerId
  readonly startedAt?: number
}

/** Datos para crear una tarea durable. */
export interface ProjectTaskCreateInput {
  readonly projectId: ProjectId
  readonly title: string
  readonly status?: ProjectTaskStatus
}

/** Datos de alta o reemplazo completo de un worker. */
export interface WorkerInput {
  readonly id?: WorkerId
  readonly name: string
  readonly status: WorkerStatus
  readonly capabilities?: readonly string[]
  readonly lastSeenAt?: string
}

/** Snapshot que el medio durable debe conservar como una unidad lógica. */
export interface ProjectStorageSnapshot {
  readonly projects: readonly ProjectRecord[]
  readonly runs: readonly ProjectRun[]
  readonly tasks: readonly ProjectTask[]
  readonly workers: readonly Worker[]
}

/** API de persistencia independiente del medio físico. */
export interface ProjectRepository {
  /** Crea un proyecto si su workspace aún no está ocupado. */
  createProject(input: ProjectRecordCreateInput): Promise<ProjectRecord>
  /** Obtiene un proyecto o devuelve `undefined` cuando no existe. */
  getProject(id: ProjectId): Promise<ProjectRecord | undefined>
  /** Lista proyectos en orden de creación descendente. */
  listProjects(): Promise<readonly ProjectRecord[]>
  /** Busca el proyecto asociado al workspace. */
  findProjectByWorkspace(workspace: string): Promise<ProjectRecord | undefined>
  /** Actualiza un proyecto solo si conserva la revisión observada. */
  updateProject(id: ProjectId, expectedRevision: number, patch: ProjectRecordUpdateInput): Promise<ProjectRecord>
  /** Crea una ejecución asociada a un proyecto existente. */
  createRun(input: ProjectRunCreateInput): Promise<ProjectRun>
  /** Lista las ejecuciones de un proyecto. */
  listRuns(projectId: ProjectId): Promise<readonly ProjectRun[]>
  /** Crea una tarea asociada a un proyecto existente. */
  createTask(input: ProjectTaskCreateInput): Promise<ProjectTask>
  /** Lista las tareas de un proyecto. */
  listTasks(projectId: ProjectId): Promise<readonly ProjectTask[]>
  /** Persiste el estado completo de un worker. */
  upsertWorker(input: WorkerInput): Promise<Worker>
  /** Lee un worker registrado. */
  getWorker(id: WorkerId): Promise<Worker | undefined>
  /** Cierra el medio y rechaza nuevas operaciones. */
  close(): Promise<void>
}

/** Tier de modelo disponible para una tarea. */
export type ProjectModelTier = 'cheap' | 'balanced' | 'strong'

/** Complejidad que usa el router para elegir un tier. */
export type ProjectTaskComplexity = 'low' | 'medium' | 'high' | 'critical'

/** Ruta de modelo elegida por una política. */
export interface ProjectModelRoute {
  readonly provider: string
  readonly model: string
  readonly tier?: ProjectModelTier
  readonly estimatedCost?: number
}

/** Política de presupuesto y rutas para el router existente. */
export interface ProjectModelPolicy {
  readonly id: string
  readonly budget: number
  readonly routes: Partial<Record<ProjectModelTier, ProjectModelRoute>>
}

/** Entrada que el router usa para resolver una ruta. */
export interface ProjectModelRequest {
  readonly task: {
    readonly complexity: ProjectTaskComplexity
    readonly preferredTier?: ProjectModelTier
  }
  readonly estimatedCost: number
}

/** Recurso que un worker puede reservar en modo compartido o exclusivo. */
export interface ProjectResourceClaim {
  readonly kind: string
  readonly key: string
  readonly mode: 'shared' | 'exclusive'
}
