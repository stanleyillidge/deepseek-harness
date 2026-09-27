// Visión general del proceso:
// Este archivo define los hechos durables mínimos para reconstruir un run después de una caída.
// El ledger conserva estados y metadatos pequeños; los resultados de workers se mantienen en el
// proceso del orquestador y pueden no estar disponibles después de un crash.
//
// Detalle paso a paso:
// 1. Se declaran estados de tareas y runs como uniones cerradas.
// 2. Se modelan eventos idempotentes y sus registros secuenciados.
// 3. Se describe el checkpoint que recovery entrega al orquestador.

import type { ProjectRunId, ProjectTaskId, ProjectTask } from '@deepseek-ai/dsh-project-resource-lease'

/** Estados observables de una tarea durante su ciclo de ejecución. */
export type ProjectTaskStatus =
  | 'pending'
  | 'ready'
  | 'leased'
  | 'running'
  | 'verifying'
  | 'retrying'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'cancelled'

/** Estados observables de una ejecución completa. */
export type ProjectRunStatus =
  | 'pending'
  | 'recovering'
  | 'running'
  | 'paused'
  | 'cancelling'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

/** Tipos de hechos que el ledger conserva. */
export type ProjectLedgerEventType =
  | 'run-created'
  | 'run-state'
  | 'task-state'
  | 'lease-acquired'
  | 'lease-released'
  | 'verification'

/** Valores pequeños y serializables para metadatos de auditoría. */
export type ProjectLedgerValue = string | number | boolean | null

/** Evento sin secuencia; el ledger asigna sequence al publicarlo. */
export interface ProjectLedgerEvent {
  readonly idempotencyKey: string
  readonly runId: ProjectRunId
  readonly type: ProjectLedgerEventType
  readonly at: number
  readonly taskId?: ProjectTaskId
  readonly attempt?: number
  readonly status?: ProjectRunStatus | ProjectTaskStatus
  readonly details?: Readonly<Record<string, ProjectLedgerValue>>
}

/** Evento durable con secuencia monotónica dentro del ledger en memoria. */
export interface ProjectLedgerRecord extends ProjectLedgerEvent {
  readonly sequence: number
}

/** Persistencia mínima que el orquestador necesita para registrar y leer hechos. */
export interface ProjectLedger {
  append(event: ProjectLedgerEvent): Promise<ProjectLedgerRecord>
  list(runId: ProjectRunId): Promise<readonly ProjectLedgerRecord[]>
}

/** Estado reconstruido de una tarea; los estados activos se vuelven ready tras un crash. */
export interface ProjectRecoveredTask {
  readonly taskId: ProjectTaskId
  readonly status: ProjectTaskStatus
  readonly attempts: number
  readonly lastError?: string
}

/** Checkpoint de un run recuperado desde el ledger. */
export interface ProjectRecoveredRun {
  readonly runId: ProjectRunId
  readonly status: ProjectRunStatus
  readonly tasks: readonly ProjectRecoveredTask[]
  readonly lastSequence: number
}

/** Entrada usada para validar que el recovery corresponde al DAG actual. */
export interface ProjectRecoveryDefinition<TInput> {
  readonly runId: ProjectRunId
  readonly tasks: readonly ProjectTask<TInput>[]
}
