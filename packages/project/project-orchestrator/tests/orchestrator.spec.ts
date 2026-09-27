// Visión general del proceso:
// Estas pruebas ejercitan el coordinador con adaptadores en memoria y promesas controladas.
// Las barreras explícitas demuestran solapamiento o espera por conflicto sin depender de sleeps.
//
// Detalle paso a paso:
// 1. Se verifica que dos raíces independientes corran juntas y su dependiente espere a ambas.
// 2. Se verifica que un writeScope compartido serialice tareas aunque exista capacidad paralela.
// 3. Se verifica retry y verificación explícita después de un fallo transitorio.
// 4. Se clona el ledger antes de cancelar el proceso original y se recupera el run en otro proceso.

import { describe, expect, it } from 'vitest'
import { projectRunId, projectTaskId } from '@deepseek-ai/dsh-project-resource-lease'
import { InMemoryProjectLedger } from '@deepseek-ai/dsh-project-recovery'
import type { ProjectWorkerAdapter } from '@deepseek-ai/dsh-project-worker'
import type { ProjectVerifier } from '@deepseek-ai/dsh-project-verifier'
import { ProjectOrchestrator } from '../src/index.ts'

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
  reject(error: Error): void
}

function deferred<T>(): Deferred<T> {
  let resolvePromise!: (value: T) => void
  let rejectPromise!: (error: Error) => void
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return { promise, resolve: resolvePromise, reject: rejectPromise }
}

function acceptingVerifier(): ProjectVerifier<string, string, string> {
  return {
    verify: async ({ result }) => ({ verified: true, evidence: result.output }),
  }
}

function task(
  id: string,
  overrides: Partial<{
    dependsOn: readonly string[]
    writeScopes: readonly string[]
    resourceClaims: readonly string[]
    maxAttempts: number
  }> = {},
) {
  return {
    id: projectTaskId(id),
    dependsOn: (overrides.dependsOn ?? []).map(projectTaskId),
    writeScopes: overrides.writeScopes ?? [],
    resourceClaims: overrides.resourceClaims ?? [],
    input: id,
    ...(overrides.maxAttempts === undefined ? {} : { maxAttempts: overrides.maxAttempts }),
  }
}

describe('ProjectOrchestrator', () => {
  it('ejecuta raíces independientes en paralelo y respeta el DAG', async () => {
    const a = deferred<undefined>()
    const b = deferred<undefined>()
    const started: string[] = []
    const worker: ProjectWorkerAdapter<string, string> = {
      start: ({ task: currentTask, input }) => {
        started.push(currentTask.id)
        const completion = currentTask.id === projectTaskId('a') ? a.promise : currentTask.id === projectTaskId('b') ? b.promise : Promise.resolve()
        return { result: completion.then(() => ({ output: input })) }
      },
    }
    const orchestrator = new ProjectOrchestrator({ worker, verifier: acceptingVerifier(), maxParallelism: 2 })
    const run = orchestrator.start({
      runId: projectRunId('parallel'),
      tasks: [task('a'), task('b'), task('c', { dependsOn: ['a', 'b'] })],
    })
    await run.ready
    expect(started).toEqual([projectTaskId('a'), projectTaskId('b')])
    a.resolve(undefined)
    b.resolve(undefined)
    const result = await run.result
    expect(started).toEqual([projectTaskId('a'), projectTaskId('b'), projectTaskId('c')])
    expect(result.status).toBe('succeeded')
    expect(result.tasks.every(currentTask => currentTask.status === 'succeeded')).toBe(true)
  })

  it('serializa tareas con writeScope en conflicto', async () => {
    const first = deferred<undefined>()
    const secondStarted = deferred<undefined>()
    const started: string[] = []
    const worker: ProjectWorkerAdapter<string, string> = {
      start: ({ task: currentTask, input }) => {
        started.push(currentTask.id)
        if (currentTask.id === projectTaskId('b')) secondStarted.resolve(undefined)
        const completion = currentTask.id === projectTaskId('a') ? first.promise : Promise.resolve()
        return { result: completion.then(() => ({ output: input })) }
      },
    }
    const run = new ProjectOrchestrator({ worker, verifier: acceptingVerifier(), maxParallelism: 2 }).start({
      runId: projectRunId('conflict'),
      tasks: [task('a', { writeScopes: ['src'] }), task('b', { writeScopes: ['./src/feature'] })],
    })
    await run.ready
    expect(started).toEqual([projectTaskId('a')])
    first.resolve(undefined)
    await secondStarted.promise
    expect(started).toEqual([projectTaskId('a'), projectTaskId('b')])
    expect((await run.result).status).toBe('succeeded')
  })

  it('pausa nuevas adquisiciones y las reanuda después de un worker activo', async () => {
    const first = deferred<undefined>()
    const firstSucceeded = deferred<undefined>()
    const secondStarted = deferred<undefined>()
    const started: string[] = []
    const worker: ProjectWorkerAdapter<string, string> = {
      start: ({ task: currentTask, input }) => {
        started.push(currentTask.id)
        if (currentTask.id === projectTaskId('b')) secondStarted.resolve(undefined)
        const completion = currentTask.id === projectTaskId('a') ? first.promise : Promise.resolve()
        return { result: completion.then(() => ({ output: input })) }
      },
    }
    const run = new ProjectOrchestrator({ worker, verifier: acceptingVerifier(), maxParallelism: 2 }).start({
      runId: projectRunId('pause'),
      tasks: [task('a', { writeScopes: ['src'] }), task('b', { writeScopes: ['./src/feature'] })],
    })
    run.subscribe((snapshot) => {
      if (snapshot.tasks[0]?.status === 'succeeded') firstSucceeded.resolve(undefined)
    })
    await run.ready
    await run.pause()
    first.resolve(undefined)
    await firstSucceeded.promise
    expect(run.snapshot().status).toBe('paused')
    expect(started).toEqual([projectTaskId('a')])
    await run.resume()
    await secondStarted.promise
    expect((await run.result).status).toBe('succeeded')
  })

  it('cancela un worker activo y publica el estado terminal cancelado', async () => {
    const running = deferred<undefined>()
    const worker: ProjectWorkerAdapter<string, string> = {
      start: ({ input }) => ({
        result: running.promise.then(() => ({ output: input })),
        cancel: () => { running.resolve(undefined) },
      }),
    }
    const run = new ProjectOrchestrator({ worker, verifier: acceptingVerifier() }).start({
      runId: projectRunId('cancel'),
      tasks: [task('a')],
    })
    await run.ready
    await run.cancel('cancelación de prueba')
    const result = await run.result
    expect(result.status).toBe('cancelled')
    expect(result.tasks[0]?.status).toBe('cancelled')
  })

  it('reintenta un worker fallido y solo completa tras verificación', async () => {
    let attempts = 0
    let verifications = 0
    const worker: ProjectWorkerAdapter<string, string> = {
      start: ({ input }) => {
        attempts += 1
        return attempts === 1
          ? { result: Promise.reject(new Error('transient')) }
          : { result: Promise.resolve({ output: input }) }
      },
    }
    const verifier: ProjectVerifier<string, string, string> = {
      verify: async ({ result }) => {
        verifications += 1
        return { verified: true, evidence: result.output }
      },
    }
    const run = new ProjectOrchestrator({ worker, verifier, maxParallelism: 1, defaultMaxAttempts: 2 }).start({
      runId: projectRunId('retry'),
      tasks: [task('retry')],
    })
    const result = await run.result
    expect(result.status).toBe('succeeded')
    expect(result.tasks[0]?.attempts).toBe(2)
    expect(attempts).toBe(2)
    expect(verifications).toBe(1)
  })

  it('recupera un run con una tarea activa después de clonar el ledger', async () => {
    const originalLedger = new InMemoryProjectLedger()
    const crashedTask = deferred<undefined>()
    const firstWorker: ProjectWorkerAdapter<string, string> = {
      start: ({ input }) => ({
        result: crashedTask.promise.then(() => ({ output: input })),
        cancel: () => { crashedTask.resolve(undefined) },
      }),
    }
    const definition = { runId: projectRunId('crash'), tasks: [task('crashed')] }
    const firstRun = new ProjectOrchestrator({
      worker: firstWorker,
      verifier: acceptingVerifier(),
      ledger: originalLedger,
    }).start(definition)
    await firstRun.ready
    expect(firstRun.snapshot().tasks[0]?.status).toBe('running')
    const persistedAtCrash = originalLedger.snapshot()
    const recoveredLedger = new InMemoryProjectLedger(persistedAtCrash)
    const recoveredWorker: ProjectWorkerAdapter<string, string> = {
      start: ({ input }) => ({ result: Promise.resolve({ output: input }) }),
    }
    const recoveredRun = await new ProjectOrchestrator({
      worker: recoveredWorker,
      verifier: acceptingVerifier(),
      ledger: recoveredLedger,
    }).recover(definition)
    const recoveredResult = await recoveredRun.result
    expect(recoveredResult.status).toBe('succeeded')
    expect(recoveredResult.tasks[0]?.attempts).toBe(2)
    await firstRun.cancel('proceso original detenido tras snapshot')
    await firstRun.result
  })
})
