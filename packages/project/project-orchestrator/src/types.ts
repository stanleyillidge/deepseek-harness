// Visión general del proceso:
// Este archivo define la API pública del coordinador: configuración del DAG, snapshots de estado,
// resultado final y operaciones de control. La implementación no expone proveedores concretos;
// solo recibe los contratos de worker, verifier, lease y ledger.
//
// Detalle paso a paso:
// 1. Se declara la configuración de paralelismo, reintentos y adaptadores.
// 2. Se describen snapshots inmutables para observar tareas y runs.
// 3. Se expone un handle con ready, result, suscripción y control de ciclo de vida.

import type {
  ProjectLease,
  ProjectResourceLeaseOptions,
  ProjectResourceLeaseManager,
  ProjectRunId,
  ProjectTask,
  ProjectTaskId,
} from '@deepseek-ai/dsh-project-resource-lease'
import type { ProjectWorkerAdapter } from '@deepseek-ai/dsh-project-worker'
import type { ProjectVerification, ProjectVerifier } from '@deepseek-ai/dsh-project-verifier'
import type {
  ProjectLedger,
  ProjectRecoveredRun,
  ProjectRunStatus,
  ProjectTaskStatus,
} from '@deepseek-ai/dsh-project-recovery'

/** Reloj inyectable para que timestamps de eventos y pruebas sean reproducibles. */
export interface ProjectOrchestratorClock {
  now(): number
}

/** Opciones compartidas por todas las ejecuciones de un orquestador. */
export interface ProjectOrchestratorOptions<TInput, TOutput, TProof> {
  readonly worker: ProjectWorkerAdapter<TInput, TOutput>
  readonly verifier: ProjectVerifier<TInput, TOutput, TProof>
  readonly ledger?: ProjectLedger
  readonly leaseManager?: ProjectResourceLeaseManager
  readonly leaseOptions?: ProjectResourceLeaseOptions
  readonly maxParallelism?: number
  readonly defaultMaxAttempts?: number
  readonly clock?: ProjectOrchestratorClock
}

/** Definición de un DAG de tareas para un run. */
export interface ProjectRunDefinition<TInput> {
  readonly runId: ProjectRunId
  readonly tasks: readonly ProjectTask<TInput>[]
}

/** Vista observable de una tarea, incluyendo evidencia de verificación cuando existe. */
export interface ProjectTaskSnapshot<TOutput, TProof> {
  readonly id: ProjectTaskId
  readonly status: ProjectTaskStatus
  readonly attempts: number
  readonly output?: TOutput
  readonly error?: string
  readonly verification?: ProjectVerification<TProof>
  readonly lease?: ProjectLease
}

/** Vista observable del run completo, ordenada según el DAG entregado. */
export interface ProjectRunSnapshot<TOutput, TProof> {
  readonly runId: ProjectRunId
  readonly status: ProjectRunStatus
  readonly tasks: readonly ProjectTaskSnapshot<TOutput, TProof>[]
}

/** Resultado terminal del run. */
export interface ProjectRunResult<TOutput, TProof> extends ProjectRunSnapshot<TOutput, TProof> {
  readonly status: 'succeeded' | 'failed' | 'cancelled'
}

/** Listener de snapshots publicados después de cada cambio confirmado en memoria. */
export type ProjectRunListener<TOutput, TProof> = (snapshot: ProjectRunSnapshot<TOutput, TProof>) => void

/** Handle de control de una ejecución en curso. */
export interface ProjectRunHandle<TOutput, TProof> {
  readonly runId: ProjectRunId
  readonly ready: Promise<void>
  readonly result: Promise<ProjectRunResult<TOutput, TProof>>
  snapshot(): ProjectRunSnapshot<TOutput, TProof>
  subscribe(listener: ProjectRunListener<TOutput, TProof>): () => void
  pause(): Promise<void>
  resume(): Promise<void>
  cancel(reason?: string): Promise<void>
}

/** Checkpoint interno que el controlador utiliza al reanudar un run recuperado. */
export interface ProjectRunRecoveryState {
  readonly recovered: ProjectRecoveredRun
}
