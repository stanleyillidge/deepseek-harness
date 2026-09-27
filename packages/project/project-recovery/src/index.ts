// Visión general del proceso:
// Este módulo ofrece un ledger en memoria con deduplicación por idempotencyKey y un reconstructor
// de runs. El ledger es una implementación MVP intercambiable: un adaptador persistente puede
// conservar el mismo contrato sin cambiar al orquestador.
//
// Detalle paso a paso:
// 1. append devuelve el mismo registro cuando recibe dos veces el mismo hecho.
// 2. Un key reutilizado con contenido distinto se rechaza para evitar corrupción silenciosa.
// 3. recovery selecciona el último estado por tarea y vuelve a ready lo que estaba activo.
// 4. Los registros se ordenan por sequence para que la reconstrucción sea determinista.

import type {
  ProjectLedger,
  ProjectLedgerEvent,
  ProjectLedgerRecord,
  ProjectRecoveredRun,
  ProjectRecoveredTask,
  ProjectRecoveryDefinition,
  ProjectRunStatus,
  ProjectTaskStatus,
} from './types.ts'
import type { ProjectRunId, ProjectTaskId } from '@deepseek-ai/dsh-project-resource-lease'

export type {
  ProjectLedger,
  ProjectLedgerEvent,
  ProjectLedgerRecord,
  ProjectLedgerValue,
  ProjectRecoveredRun,
  ProjectRecoveredTask,
  ProjectRecoveryDefinition,
  ProjectRunStatus,
  ProjectTaskStatus,
} from './types.ts'

function sameEvent(left: ProjectLedgerEvent, right: ProjectLedgerEvent): boolean {
  const content = (event: ProjectLedgerEvent): string => JSON.stringify({
    idempotencyKey: event.idempotencyKey,
    runId: event.runId,
    type: event.type,
    at: event.at,
    ...(event.taskId === undefined ? {} : { taskId: event.taskId }),
    ...(event.attempt === undefined ? {} : { attempt: event.attempt }),
    ...(event.status === undefined ? {} : { status: event.status }),
    ...(event.details === undefined ? {} : { details: event.details }),
  })
  return content(left) === content(right)
}

/**
 * Ledger determinista para pruebas y MVP locales.
 * Los consumidores persistentes pueden implementar ProjectLedger sin reutilizar esta clase.
 */
export class InMemoryProjectLedger implements ProjectLedger {
  private readonly records: ProjectLedgerRecord[]
  private readonly byKey = new Map<string, ProjectLedgerRecord>()

  /** Crea un ledger vacío o reconstruye uno desde registros previamente guardados. */
  constructor(initialRecords: readonly ProjectLedgerRecord[] = []) {
    this.records = []
    for (const record of [...initialRecords].sort((left, right) => left.sequence - right.sequence)) {
      if (this.byKey.has(record.idempotencyKey)) throw new Error(`idempotencyKey duplicado: ${record.idempotencyKey}`)
      this.records.push({ ...record })
      this.byKey.set(record.idempotencyKey, { ...record })
    }
  }

  /**
   * Publica un hecho una sola vez.
   * @param event - hecho con clave idempotente.
   * @returns registro existente o recién asignado.
   */
  append(event: ProjectLedgerEvent): Promise<ProjectLedgerRecord> {
    const existing = this.byKey.get(event.idempotencyKey)
    if (existing !== undefined) {
      if (!sameEvent(existing, event)) return Promise.reject(new Error(`idempotencyKey reutilizado con contenido distinto: ${event.idempotencyKey}`))
      return Promise.resolve({ ...existing })
    }
    const sequence = (this.records.at(-1)?.sequence ?? 0) + 1
    const record: ProjectLedgerRecord = { ...event, sequence }
    this.records.push(record)
    this.byKey.set(record.idempotencyKey, record)
    return Promise.resolve({ ...record })
  }

  /**
   * Devuelve solo los hechos del run solicitado, en orden durable.
   * @param runId - run que se desea consultar.
   * @returns hechos ordenados por secuencia.
   */
  list(runId: ProjectRunId): Promise<readonly ProjectLedgerRecord[]> {
    return Promise.resolve(this.records.filter(record => record.runId === runId).map(record => ({ ...record })))
  }

  /**
   * Devuelve una copia de todos los registros para simular un proceso nuevo.
   * @returns snapshot durable independiente del array interno.
   */
  snapshot(): readonly ProjectLedgerRecord[] {
    return this.records.map(record => ({ ...record }))
  }
}

const ACTIVE_TASK_STATES: ReadonlySet<ProjectTaskStatus> = new Set(['leased', 'running', 'verifying', 'retrying'])

function taskStatusFromRecord(record: ProjectLedgerRecord): ProjectTaskStatus | undefined {
  return record.type === 'task-state' && record.taskId !== undefined && isTaskStatus(record.status)
    ? record.status
    : undefined
}

function isTaskStatus(status: ProjectLedgerRecord['status']): status is ProjectTaskStatus {
  return status === 'pending' || status === 'ready' || status === 'leased' || status === 'running'
    || status === 'verifying' || status === 'retrying' || status === 'succeeded' || status === 'failed'
    || status === 'blocked' || status === 'cancelled'
}

function isRunStatus(status: ProjectLedgerRecord['status']): status is ProjectRunStatus {
  return status === 'pending' || status === 'recovering' || status === 'running' || status === 'paused'
    || status === 'cancelling' || status === 'succeeded' || status === 'failed' || status === 'cancelled'
}

/** Reconstruye estados de tareas desde la secuencia durable de un run. */
export class ProjectRunRecovery {
  /**
   * Crea un reconstructor sobre un ledger.
   * @param ledger - fuente de eventos del run.
   */
  constructor(private readonly ledger: ProjectLedger) {}

  /**
   * Recupera el último estado conocido de cada tarea.
   * @param definition - DAG actual que debe corresponder al run registrado.
   * @returns checkpoint listo para que el orquestador reanude tareas incompletas.
   */
  async recover<TInput>(definition: ProjectRecoveryDefinition<TInput>): Promise<ProjectRecoveredRun> {
    const records = [...await this.ledger.list(definition.runId)].sort((left, right) => left.sequence - right.sequence)
    if (records.length === 0) throw new Error(`no hay registros para recuperar el run ${definition.runId}`)
    const taskIds = new Set(definition.tasks.map(task => task.id))
    const latest = new Map<ProjectTaskId, ProjectRecoveredTask>()
    let status: ProjectRunStatus = 'recovering'
    for (const record of records) {
      if (record.type === 'run-state' && isRunStatus(record.status)) status = record.status
      if (record.type === 'task-state' && record.taskId !== undefined && !taskIds.has(record.taskId)) {
        throw new Error(`el ledger contiene una tarea ausente del DAG actual: ${record.taskId}`)
      }
      const taskStatus = taskStatusFromRecord(record)
      if (taskStatus === undefined || record.taskId === undefined) continue
      const previous = latest.get(record.taskId)
      const attempts = Math.max(previous?.attempts ?? 0, record.attempt ?? 0)
      const lastError = record.details?.error
      const normalizedStatus = ACTIVE_TASK_STATES.has(taskStatus) ? 'ready' : taskStatus
      latest.set(record.taskId, {
        taskId: record.taskId,
        status: normalizedStatus,
        attempts,
        ...(typeof lastError === 'string' ? { lastError } : previous?.lastError === undefined ? {} : { lastError: previous.lastError }),
      })
    }
    const tasks = definition.tasks.map(task => latest.get(task.id) ?? {
      taskId: task.id,
      status: 'pending' as const,
      attempts: 0,
    })
    return { runId: definition.runId, status: status === 'running' || status === 'cancelling' ? 'recovering' : status, tasks, lastSequence: records.at(-1)?.sequence ?? 0 }
  }
}
