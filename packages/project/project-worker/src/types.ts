// Visión general del proceso:
// Este archivo define el contrato mínimo entre el orquestador y un worker. El worker recibe
// una tarea y un lease, devuelve un resultado y puede recibir cancelación; no conoce cómo DSH
// representa un Subagent o un Job.
//
// Detalle paso a paso:
// 1. Se describe el contexto que el adaptador necesita para ejecutar una tarea.
// 2. Se describe el resultado exitoso y el handle de una ejecución activa.
// 3. Se declaran adaptadores estructurales para Subagents y Jobs, sin importar sus paquetes.

import type { ProjectLease, ProjectRunId, ProjectTask } from '@deepseek-ai/dsh-project-resource-lease'

/** Contexto entregado al adaptador de una tarea. */
export interface ProjectWorkerContext<TInput> {
  readonly runId: ProjectRunId
  readonly task: ProjectTask<TInput>
  readonly input: TInput
  readonly attempt: number
  readonly lease: ProjectLease
  readonly signal: AbortSignal
}

/** Resultado que un worker entrega antes de la verificación explícita. */
export interface ProjectWorkerResult<TOutput> {
  readonly output: TOutput
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>
}

/** Ejecución nativa de un adaptador; cancel es opcional para puentes que solo usan AbortSignal. */
export interface ProjectWorkerExecution<TOutput> {
  readonly result: Promise<ProjectWorkerResult<TOutput>>
  readonly cancel?: (reason: string) => void
}

/** Adaptador genérico que el orquestador usa para iniciar una tarea. */
export interface ProjectWorkerAdapter<TInput, TOutput> {
  start(context: ProjectWorkerContext<TInput>): ProjectWorkerExecution<TOutput>
}

/** Adaptador estructural para integrar un proveedor de Subagents sin importarlo aquí. */
export interface ProjectSubagentAdapter<TInput, TOutput> {
  startSubagent(context: ProjectWorkerContext<TInput>): ProjectWorkerExecution<TOutput>
}

/** Adaptador estructural para integrar un proveedor de Jobs sin importarlo aquí. */
export interface ProjectJobAdapter<TInput, TOutput> {
  startJob(context: ProjectWorkerContext<TInput>): ProjectWorkerExecution<TOutput>
}

/** Handle controlado que el orquestador conserva hasta que la tarea termina. */
export interface ProjectWorkerHandle<TOutput> {
  readonly result: Promise<ProjectWorkerResult<TOutput>>
  cancel(reason: string): void
}
