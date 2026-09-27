/**
 * Validación de la frontera durable de Projects. Cada payload SQLite se
 * decodifica y valida antes de entrar al repositorio, de modo que un registro
 * corrupto nunca se convierte silenciosamente en estado parcial.
 * @module @deepseek-ai/dsh-project/validator
 */

import { brandString } from '@deepseek-ai/dsh-brand'
import { ProjectValidationError } from './errors.ts'
import { assertProjectInvariants } from './invariants.ts'
import type {
  ProjectId, ProjectRecord, ProjectRun, ProjectRunId, ProjectStorageSnapshot,
  ProjectTask, ProjectTaskId, Worker, WorkerId,
} from './types.ts'

// Visión general del proceso:
// Estas funciones convierten datos desconocidos provenientes de SQLite en los
// tipos públicos de Projects después de comprobar campos, valores y fechas.
//
// Detalle paso a paso:
// 1. Se comprueba que el payload sea un objeto con propiedades propias.
// 2. Se validan los campos escalares y se aplican las marcas nominales.
// 3. El snapshot completo pasa además por las invariantes entre registros.

/** Valida un proyecto recibido por un consumidor o leído desde SQLite. */
export function validateProjectRecord(value: unknown): ProjectRecord {
  const record = object(value, 'project')
  const createdAt = timestamp(record.createdAt, 'project.createdAt')
  const updatedAt = timestamp(record.updatedAt, 'project.updatedAt')
  if (Date.parse(updatedAt) < Date.parse(createdAt)) throw invalid('project.updatedAt no puede ser anterior a project.createdAt')
  return {
    id: brandedProjectId(record.id, 'project.id'),
    workspace: requiredString(record.workspace, 'project.workspace'),
    name: requiredString(record.name, 'project.name'),
    ...(record.description === undefined ? {} : { description: string(record.description, 'project.description') }),
    createdAt,
    updatedAt,
    revision: positiveInteger(record.revision, 'project.revision'),
  }
}

/** Valida una ejecución recibida por un consumidor o leída desde SQLite. */
export function validateProjectRun(value: unknown): ProjectRun {
  const record = object(value, 'run')
  const status = enumValue(record.status, ['queued', 'running', 'completed', 'failed', 'cancelled'] as const, 'run.status')
  return {
    id: brandString<ProjectRunId>(requiredString(record.id, 'run.id')),
    projectId: brandedProjectId(record.projectId, 'run.projectId'),
    status,
    ...(record.workerId === undefined ? {} : { workerId: brandString<WorkerId>(requiredString(record.workerId, 'run.workerId')) }),
    ...(record.startedAt === undefined ? {} : { startedAt: nonnegativeInteger(record.startedAt, 'run.startedAt') }),
    ...(record.finishedAt === undefined ? {} : { finishedAt: nonnegativeInteger(record.finishedAt, 'run.finishedAt') }),
    ...(record.error === undefined ? {} : { error: string(record.error, 'run.error') }),
  }
}

/** Valida una tarea recibida por un consumidor o leída desde SQLite. */
export function validateProjectTask(value: unknown): ProjectTask {
  const record = object(value, 'task')
  const createdAt = timestamp(record.createdAt, 'task.createdAt')
  const updatedAt = timestamp(record.updatedAt, 'task.updatedAt')
  if (Date.parse(updatedAt) < Date.parse(createdAt)) throw invalid('task.updatedAt no puede ser anterior a task.createdAt')
  return {
    id: brandString<ProjectTaskId>(requiredString(record.id, 'task.id')),
    projectId: brandedProjectId(record.projectId, 'task.projectId'),
    title: requiredString(record.title, 'task.title'),
    status: enumValue(record.status, ['todo', 'in_progress', 'completed', 'blocked'] as const, 'task.status'),
    createdAt,
    updatedAt,
  }
}

/** Valida un worker recibido por un consumidor o leído desde SQLite. */
export function validateWorker(value: unknown): Worker {
  const record = object(value, 'worker')
  if (!Array.isArray(record.capabilities) || !record.capabilities.every(capability => typeof capability === 'string')) {
    throw invalid('worker.capabilities debe ser una lista de strings')
  }
  return {
    id: brandString<WorkerId>(requiredString(record.id, 'worker.id')),
    name: requiredString(record.name, 'worker.name'),
    status: enumValue(record.status, ['idle', 'busy', 'offline'] as const, 'worker.status'),
    capabilities: [...record.capabilities],
    lastSeenAt: timestamp(record.lastSeenAt, 'worker.lastSeenAt'),
  }
}

/** Valida todas las filas y después las relaciones entre ellas. */
export function validateProjectSnapshot(value: unknown): ProjectStorageSnapshot {
  const record = object(value, 'snapshot')
  if (!Array.isArray(record.projects) || !Array.isArray(record.runs)
    || !Array.isArray(record.tasks) || !Array.isArray(record.workers)) {
    throw invalid('snapshot debe contener las listas projects, runs, tasks y workers')
  }
  const snapshot: ProjectStorageSnapshot = {
    projects: record.projects.map(validateProjectRecord),
    runs: record.runs.map(validateProjectRun),
    tasks: record.tasks.map(validateProjectTask),
    workers: record.workers.map(validateWorker),
  }
  assertProjectInvariants(snapshot)
  return snapshot
}

function object(value: unknown, subject: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${subject} debe ser un objeto`)
  return value as Record<string, unknown>
}

function string(value: unknown, field: string): string {
  if (typeof value !== 'string') throw invalid(`${field} debe ser un string`)
  return value
}

function requiredString(value: unknown, field: string): string {
  const result = string(value, field).trim()
  if (result.length === 0) throw invalid(`${field} no puede estar vacío`)
  return result
}

function timestamp(value: unknown, field: string): string {
  const result = string(value, field)
  if (!Number.isFinite(Date.parse(result))) throw invalid(`${field} debe ser una fecha ISO válida`)
  return result
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) throw invalid(`${field} debe ser un entero seguro positivo`)
  return value as number
}

function nonnegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw invalid(`${field} debe ser un entero seguro no negativo`)
  return value as number
}

function brandedProjectId(value: unknown, field: string): ProjectId {
  return brandString<ProjectId>(requiredString(value, field))
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) throw invalid(`${field} tiene un valor no permitido`)
  return value
}

function invalid(message: string): ProjectValidationError {
  return new ProjectValidationError(message)
}
