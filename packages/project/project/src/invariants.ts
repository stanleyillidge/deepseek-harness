/**
 * Invariantes entre registros de Projects. El validador comprueba cada
 * payload; este módulo comprueba relaciones que una fila aislada no puede
 * expresar, como workspace único y referencias existentes.
 * @module @deepseek-ai/dsh-project/invariants
 */

import { ProjectInvariantError } from './errors.ts'
import type { ProjectStorageSnapshot } from './types.ts'

// Visión general del proceso:
// Este bloque verifica las relaciones globales del snapshot antes de exponerlo
// a los consumidores del repositorio.
//
// Detalle paso a paso:
// 1. Comprueba que cada identidad y workspace aparezcan una sola vez.
// 2. Comprueba que runs y tasks apunten a proyectos existentes.
// 3. Comprueba que cada run que nombra un worker apunte a un worker registrado.
export function assertProjectInvariants(snapshot: ProjectStorageSnapshot): void {
  const projectIds = new Set<string>()
  const workspaces = new Set<string>()
  for (const project of snapshot.projects) {
    if (projectIds.has(project.id)) throw new ProjectInvariantError(`project id duplicado '${project.id}'`)
    if (workspaces.has(project.workspace)) {
      throw new ProjectInvariantError(`workspace duplicado '${project.workspace}'`)
    }
    projectIds.add(project.id)
    workspaces.add(project.workspace)
  }

  const workerIds = new Set<string>()
  for (const worker of snapshot.workers) {
    if (workerIds.has(worker.id)) throw new ProjectInvariantError(`worker id duplicado '${worker.id}'`)
    workerIds.add(worker.id)
  }

  for (const run of snapshot.runs) {
    if (!projectIds.has(run.projectId)) {
      throw new ProjectInvariantError(`run '${run.id}' referencia un proyecto inexistente '${run.projectId}'`)
    }
    if (run.workerId !== undefined && !workerIds.has(run.workerId)) {
      throw new ProjectInvariantError(`run '${run.id}' referencia un worker inexistente '${run.workerId}'`)
    }
  }
  for (const task of snapshot.tasks) {
    if (!projectIds.has(task.projectId)) {
      throw new ProjectInvariantError(`task '${task.id}' referencia un proyecto inexistente '${task.projectId}'`)
    }
  }
}
