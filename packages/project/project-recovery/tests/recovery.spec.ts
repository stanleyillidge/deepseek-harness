// Visión general del proceso:
// Estas pruebas verifican que el ledger sea idempotente y que recovery convierta un estado activo
// en ready después de simular una pérdida de proceso.
//
// Detalle paso a paso:
// 1. Se publica el mismo evento dos veces y se conserva una sola secuencia.
// 2. Se rechaza reutilizar una clave con contenido diferente.
// 3. Se reconstruye una tarea running como ready conservando el número de intento.

import { describe, expect, it } from 'vitest'
import { projectRunId, projectTaskId } from '@deepseek-ai/dsh-project-resource-lease'
import { InMemoryProjectLedger, ProjectRunRecovery } from '../src/index.ts'

describe('project recovery', () => {
  it('deduplica hechos por idempotencyKey y rechaza contenido divergente', async () => {
    const ledger = new InMemoryProjectLedger()
    const event = {
      idempotencyKey: 'run-1:created',
      runId: projectRunId('run-1'),
      type: 'run-created' as const,
      at: 1,
      details: { source: 'test' as const },
    }
    const first = await ledger.append(event)
    const duplicate = await ledger.append(event)
    expect(duplicate).toEqual(first)
    expect(ledger.snapshot()).toHaveLength(1)
    await expect(ledger.append({ ...event, at: 2 })).rejects.toThrow('contenido distinto')
  })

  it('recupera una tarea running como ready para el siguiente intento', async () => {
    const ledger = new InMemoryProjectLedger()
    const runId = projectRunId('run-crashed')
    const taskId = projectTaskId('task-a')
    await ledger.append({ idempotencyKey: 'run-crashed:created', runId, type: 'run-created', at: 1 })
    await ledger.append({ idempotencyKey: 'run-crashed:state:running', runId, type: 'run-state', status: 'running', at: 2 })
    await ledger.append({ idempotencyKey: 'run-crashed:task-a:running', runId, type: 'task-state', taskId, attempt: 1, status: 'running', at: 3 })
    const recovered = await new ProjectRunRecovery(ledger).recover({
      runId,
      tasks: [{ id: taskId, dependsOn: [], writeScopes: [], resourceClaims: [], input: 'input' }],
    })
    expect(recovered.status).toBe('recovering')
    expect(recovered.tasks).toEqual([{ taskId, status: 'ready', attempts: 1 }])
    expect(recovered.lastSequence).toBe(3)
  })
})
