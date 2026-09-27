// Visión general del proceso:
// Este módulo convierte un ProjectWorkerAdapter en un handle cancelable y conserva la separación
// entre la política de ejecución y los proveedores DSH. El runner crea un AbortController propio,
// por lo que un adaptador puede reaccionar a cancelación aunque no implemente cancel explícito.
//
// Detalle paso a paso:
// 1. Se crea un controller por tarea y se entrega su señal al adaptador.
// 2. Se normalizan errores síncronos del inicio como una promesa rechazada del handle.
// 3. Se ofrece cancelación idempotente que avisa tanto a la señal como al adaptador.
// 4. Las clases puente delegan en Subagent o Job mediante interfaces locales, sin acoplar imports.

import type {
  ProjectJobAdapter,
  ProjectSubagentAdapter,
  ProjectWorkerAdapter,
  ProjectWorkerContext,
  ProjectWorkerExecution,
  ProjectWorkerHandle,
} from './types.ts'

export type {
  ProjectJobAdapter,
  ProjectSubagentAdapter,
  ProjectWorkerAdapter,
  ProjectWorkerContext,
  ProjectWorkerExecution,
  ProjectWorkerHandle,
  ProjectWorkerResult,
} from './types.ts'

/**
 * Ejecuta tareas mediante un adaptador genérico y expone handles cancelables.
 * @typeParam TInput - entrada de las tareas.
 * @typeParam TOutput - salida producida por el worker.
 */
export class ProjectWorkerRunner<TInput, TOutput> {
  /**
   * Crea un runner sobre el adaptador recibido.
   * @param adapter - proveedor independiente de DSH.
   */
  constructor(private readonly adapter: ProjectWorkerAdapter<TInput, TOutput>) {}

  /**
   * Inicia una ejecución con señal de cancelación propia.
   * @param context - tarea, lease, intento y entrada de ejecución.
   * @returns handle cuya promesa se resuelve o rechaza con el resultado del adaptador.
   */
  start(context: Omit<ProjectWorkerContext<TInput>, 'signal'>): ProjectWorkerHandle<TOutput> {
    const controller = new AbortController()
    let execution: ProjectWorkerExecution<TOutput> | undefined
    let startError: unknown
    try {
      execution = this.adapter.start({ ...context, signal: controller.signal })
    } catch (error: unknown) {
      startError = error
    }
    const result = startError === undefined
      ? execution?.result ?? Promise.reject(new Error('el adaptador devolvió una ejecución inválida'))
      : Promise.reject(startError instanceof Error ? startError : new Error('el adaptador falló al iniciar el worker'))
    let cancelled = false
    return {
      result,
      cancel: (reason: string): void => {
        if (cancelled) return
        cancelled = true
        controller.abort(reason)
        execution?.cancel?.(reason)
      },
    }
  }
}

/** Puente de un proveedor estructural de Subagents hacia ProjectWorkerAdapter. */
export class ProjectSubagentWorkerAdapter<TInput, TOutput> implements ProjectWorkerAdapter<TInput, TOutput> {
  /**
   * Crea el puente que delega en startSubagent.
   * @param adapter - proveedor estructural de Subagents.
   */
  constructor(private readonly adapter: ProjectSubagentAdapter<TInput, TOutput>) {}

  /**
   * Inicia una tarea usando el proveedor de Subagents.
   * @param context - contexto de ejecución de la tarea.
   * @returns ejecución controlada por el proveedor.
   */
  start(context: ProjectWorkerContext<TInput>): ProjectWorkerExecution<TOutput> {
    return this.adapter.startSubagent(context)
  }
}

/** Puente de un proveedor estructural de Jobs hacia ProjectWorkerAdapter. */
export class ProjectJobWorkerAdapter<TInput, TOutput> implements ProjectWorkerAdapter<TInput, TOutput> {
  /**
   * Crea el puente que delega en startJob.
   * @param adapter - proveedor estructural de Jobs.
   */
  constructor(private readonly adapter: ProjectJobAdapter<TInput, TOutput>) {}

  /**
   * Inicia una tarea usando el proveedor de Jobs.
   * @param context - contexto de ejecución de la tarea.
   * @returns ejecución controlada por el proveedor.
   */
  start(context: ProjectWorkerContext<TInput>): ProjectWorkerExecution<TOutput> {
    return this.adapter.startJob(context)
  }
}
