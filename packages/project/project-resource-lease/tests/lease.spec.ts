// Visión general del proceso:
// Estas pruebas comprueban la decisión atómica de leases y el vencimiento controlado por reloj.
// Se usan timestamps inyectados para no depender del scheduler ni de esperas reales.
//
// Detalle paso a paso:
// 1. Se verifica el conflicto de scopes y claims ocupados.
// 2. Se verifica la renovación de un lease vigente.
// 3. Se verifica que un lease vencido deja de bloquear una nueva adquisición.

import { describe, expect, it } from 'vitest'
import {
  ProjectResourceLeaseManager,
  projectLeaseId,
  projectRunId,
  projectTaskId,
} from '../src/index.ts'

describe('ProjectResourceLeaseManager', () => {
  it('detecta conflictos de writeScope y resourceClaim de forma atómica', () => {
    const now = 100
    let nextId = 0
    const manager = new ProjectResourceLeaseManager({
      ttlMs: 50,
      clock: { now: () => now },
      leaseIdFactory: () => projectLeaseId(`test-lease-${++nextId}`),
    })
    const runId = projectRunId('run-1')
    const first = manager.tryAcquire({
      runId,
      taskId: projectTaskId('task-a'),
      writeScopes: ['./src/feature/'],
      resourceClaims: ['browser:1'],
    })
    expect(first?.writeScopes).toEqual(['src/feature'])
    expect(manager.tryAcquire({
      runId,
      taskId: projectTaskId('task-b'),
      writeScopes: ['src'],
      resourceClaims: ['other'],
    })).toBeUndefined()
    expect(manager.conflicts({
      runId,
      taskId: projectTaskId('task-c'),
      writeScopes: ['other'],
      resourceClaims: ['browser:1'],
    })).toEqual([{ kind: 'resourceClaim', value: 'browser:1', withTaskId: projectTaskId('task-a'), leaseId: projectLeaseId('test-lease-1') }])
  })

  it('renueva y luego libera un lease vencido según el reloj inyectado', () => {
    let now = 10
    const manager = new ProjectResourceLeaseManager({ ttlMs: 20, clock: { now: () => now } })
    const lease = manager.tryAcquire({
      runId: projectRunId('run-2'),
      taskId: projectTaskId('task-a'),
      writeScopes: ['docs'],
      resourceClaims: [],
    })
    if (lease === undefined) throw new Error('la prueba esperaba un lease')
    now = 25
    const renewed = manager.renew(lease.id)
    expect(renewed.expiresAt).toBe(45)
    now = 45
    expect(manager.isValid(lease.id)).toBe(false)
    const replacement = manager.tryAcquire({
      runId: projectRunId('run-2'),
      taskId: projectTaskId('task-b'),
      writeScopes: ['docs'],
      resourceClaims: [],
    })
    expect(replacement).toBeDefined()
    manager.release(replacement?.id ?? lease.id)
    manager.release(replacement?.id ?? lease.id)
    expect(manager.activeLeases()).toEqual([])
  })
})
