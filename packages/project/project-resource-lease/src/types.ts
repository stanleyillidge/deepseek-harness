// Visión general del proceso:
// Este módulo define las identidades, tareas y contratos de leases que comparten los paquetes
// de proyectos. La implementación concreta de los leases vive en index.ts y este archivo no
// contiene lógica ejecutable, para que el contrato de tipos pueda consumirse sin efectos.
//
// Detalle paso a paso:
// 1. Se declaran identificadores opacos para no mezclar runs, tareas y leases.
// 2. Se describe una tarea con dependencias y los dos grupos de recursos que puede ocupar.
// 3. Se declaran el reloj, la solicitud y el resultado que necesita el administrador de leases.

/** Identificador opaco de una ejecución de proyecto. */
export type ProjectRunId = string & { readonly __projectRunId: 'ProjectRunId' }

/** Identificador opaco de una tarea de proyecto. */
export type ProjectTaskId = string & { readonly __projectTaskId: 'ProjectTaskId' }

/** Identificador opaco de un lease de recursos. */
export type ProjectLeaseId = string & { readonly __projectLeaseId: 'ProjectLeaseId' }

/**
 * Tarea independiente de cualquier proveedor de ejecución.
 * @typeParam TInput - tipo del valor de entrada que recibirá el worker.
 */
export interface ProjectTask<TInput = unknown> {
  readonly id: ProjectTaskId
  readonly dependsOn: readonly ProjectTaskId[]
  readonly writeScopes: readonly string[]
  readonly resourceClaims: readonly string[]
  readonly input: TInput
  readonly maxAttempts?: number
}

/** Solicitud de adquisición atómica de los recursos de una tarea. */
export interface ProjectLeaseRequest {
  readonly runId: ProjectRunId
  readonly taskId: ProjectTaskId
  readonly writeScopes: readonly string[]
  readonly resourceClaims: readonly string[]
}

/** Lease vigente que bloquea los recursos de una tarea hasta su expiración. */
export interface ProjectLease {
  readonly id: ProjectLeaseId
  readonly runId: ProjectRunId
  readonly taskId: ProjectTaskId
  readonly writeScopes: readonly string[]
  readonly resourceClaims: readonly string[]
  readonly acquiredAt: number
  readonly expiresAt: number
}

/** Fuente de tiempo inyectable para hacer deterministas los leases y sus pruebas. */
export interface ProjectLeaseClock {
  /** Devuelve el tiempo actual en milisegundos desde Unix epoch. */
  now(): number
}

/** Razón concreta por la que una solicitud no puede adquirir un lease. */
export interface ProjectResourceConflict {
  readonly kind: 'writeScope' | 'resourceClaim'
  readonly value: string
  readonly withTaskId: ProjectTaskId
  readonly leaseId: ProjectLeaseId
}

/** Configuración del administrador de leases. */
export interface ProjectResourceLeaseOptions {
  readonly ttlMs?: number
  readonly clock?: ProjectLeaseClock
  readonly leaseIdFactory?: () => ProjectLeaseId
}
