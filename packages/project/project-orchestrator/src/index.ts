// Visión general del proceso:
// Este módulo ejecuta un DAG de tareas con un planificador determinista. Solo inicia tareas ready
// cuando sus dependencias terminaron correctamente, existe capacidad de paralelismo y el
// ProjectResourceLeaseManager no informa conflicto de writeScope ni resourceClaim. Cada intento
// pasa por el worker y luego por verificación explícita antes de ser succeeded.
//
// Detalle paso a paso:
// 1. Se valida el DAG, se registra el run y se resuelven tareas inicialmente ready.
// 2. El planificador recorre tareas en orden de definición y adquiere leases antes de iniciarlas.
// 3. Cada resultado se verifica; los fallos retryable vuelven a ready hasta maxAttempts.
// 4. pause impide nuevas adquisiciones, resume reactiva el planificador y cancel detiene tareas
//    pendientes y solicita cancelación a workers activos.
// 5. El ledger registra transiciones idempotentes; recover reconstruye tareas activas como ready.

import {
  ProjectResourceLeaseManager,
  projectTaskId,
} from '@deepseek-ai/dsh-project-resource-lease'
import type {
  ProjectLease,
  ProjectTask,
  ProjectTaskId,
} from '@deepseek-ai/dsh-project-resource-lease'
import { ProjectWorkerRunner } from '@deepseek-ai/dsh-project-worker'
import type { ProjectWorkerHandle, ProjectWorkerResult } from '@deepseek-ai/dsh-project-worker'
import { ProjectRunRecovery } from '@deepseek-ai/dsh-project-recovery'
import type {
  ProjectLedger,
  ProjectLedgerValue,
  ProjectRecoveredTask,
  ProjectRunStatus,
  ProjectTaskStatus,
} from '@deepseek-ai/dsh-project-recovery'
import type { ProjectVerification } from '@deepseek-ai/dsh-project-verifier'
import type {
  ProjectOrchestratorClock,
  ProjectOrchestratorOptions,
  ProjectRunDefinition,
  ProjectRunHandle,
  ProjectRunListener,
  ProjectRunRecoveryState,
  ProjectRunResult,
  ProjectRunSnapshot,
  ProjectTaskSnapshot,
} from './types.ts'
import { InMemoryProjectLedger } from '@deepseek-ai/dsh-project-recovery'

export type {
  ProjectOrchestratorClock,
  ProjectOrchestratorOptions,
  ProjectRunDefinition,
  ProjectRunHandle,
  ProjectRunListener,
  ProjectRunRecoveryState,
  ProjectRunResult,
  ProjectRunSnapshot,
  ProjectTaskSnapshot,
} from './types.ts'

const systemClock: ProjectOrchestratorClock = {
  now: () => Date.now(),
}

const TERMINAL_TASK_STATES: ReadonlySet<ProjectTaskStatus> = new Set(['succeeded', 'failed', 'blocked', 'cancelled'])

interface TaskRuntime<TInput, TOutput, TProof> {
  readonly task: ProjectTask<TInput>
  status: ProjectTaskStatus
  attempts: number
  output: TOutput | undefined
  error: string | undefined
  verification: ProjectVerification<TProof> | undefined
  lease: ProjectLease | undefined
  worker: ProjectWorkerHandle<TOutput> | undefined
  cancelRequested: boolean
}

function renderError(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error)
  } catch {
    return '[error no representable]'
  }
}

function isTerminal(status: ProjectTaskStatus): boolean {
  return TERMINAL_TASK_STATES.has(status)
}

function checkPositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} debe ser un entero positivo`)
  return value
}

function validateDefinition<TInput>(definition: ProjectRunDefinition<TInput>, defaultMaxAttempts: number): void {
  if (definition.tasks.length === 0) throw new Error('un run debe contener al menos una tarea')
  const ids = new Set<ProjectTaskId>()
  for (const task of definition.tasks) {
    if (ids.has(task.id)) throw new Error(`tarea duplicada: ${task.id}`)
    ids.add(task.id)
    checkPositiveInteger(task.maxAttempts ?? defaultMaxAttempts, `maxAttempts de ${task.id}`)
  }
  for (const task of definition.tasks) {
    for (const dependency of task.dependsOn) {
      if (!ids.has(dependency)) throw new Error(`la tarea ${task.id} depende de una tarea inexistente: ${dependency}`)
    }
  }
  const visiting = new Set<ProjectTaskId>()
  const visited = new Set<ProjectTaskId>()
  const byId = new Map(definition.tasks.map(task => [task.id, task]))
  const visit = (taskId: ProjectTaskId): void => {
    if (visiting.has(taskId)) throw new Error(`DAG cíclico en ${taskId}`)
    if (visited.has(taskId)) return
    visiting.add(taskId)
    for (const dependency of byId.get(taskId)?.dependsOn ?? []) visit(dependency)
    visiting.delete(taskId)
    visited.add(taskId)
  }
  for (const task of definition.tasks) visit(task.id)
}

function recoveredTaskOf(recovered: readonly ProjectRecoveredTask[], taskId: ProjectTaskId): ProjectRecoveredTask | undefined {
  return recovered.find(task => task.taskId === taskId)
}

/**
 * Orquesta ejecuciones de proyectos mediante workers, verifiers, leases y ledger intercambiables.
 * @typeParam TInput - entrada común de las tareas.
 * @typeParam TOutput - salida producida por los workers.
 * @typeParam TProof - evidencia producida por el verificador.
 */
export class ProjectOrchestrator<TInput, TOutput, TProof> {
  /** Ledger que conserva los hechos idempotentes de los runs iniciados. */
  readonly ledger: ProjectLedger
  private readonly options: ProjectOrchestratorOptions<TInput, TOutput, TProof>
  private readonly leaseManager: ProjectResourceLeaseManager
  private readonly clock: ProjectOrchestratorClock
  private readonly maxParallelism: number
  private readonly defaultMaxAttempts: number

  /**
   * Crea un orquestador sobre adaptadores explícitos.
   * @param options - worker, verifier y políticas de ejecución.
   */
  constructor(options: ProjectOrchestratorOptions<TInput, TOutput, TProof>) {
    this.options = options
    this.ledger = options.ledger ?? new InMemoryProjectLedger()
    this.leaseManager = options.leaseManager ?? new ProjectResourceLeaseManager(options.leaseOptions)
    this.clock = options.clock ?? systemClock
    this.maxParallelism = checkPositiveInteger(options.maxParallelism ?? Number.MAX_SAFE_INTEGER, 'maxParallelism')
    this.defaultMaxAttempts = checkPositiveInteger(options.defaultMaxAttempts ?? 1, 'defaultMaxAttempts')
  }

  /**
   * Inicia un run nuevo.
   * @param definition - DAG inmutable de tareas.
   * @returns handle; ready indica que el primer ciclo de planificación terminó.
   */
  start(definition: ProjectRunDefinition<TInput>): ProjectRunHandle<TOutput, TProof> {
    validateDefinition(definition, this.defaultMaxAttempts)
    return new ProjectRunController(this, definition, undefined).handle
  }

  /**
   * Recupera un run desde su ledger y reanuda estados activos como tareas ready.
   * @param definition - DAG actual del run registrado.
   * @returns handle ya conectado al proceso de recuperación.
   */
  async recover(definition: ProjectRunDefinition<TInput>): Promise<ProjectRunHandle<TOutput, TProof>> {
    validateDefinition(definition, this.defaultMaxAttempts)
    const recovered = await new ProjectRunRecovery(this.ledger).recover({ runId: definition.runId, tasks: definition.tasks })
    return new ProjectRunController(this, definition, { recovered }).handle
  }

  /**
   * Devuelve las dependencias runtime que necesita un controlador de run.
   * @returns configuración inyectada y servicios de ejecución.
   * @internal
   */
  getRuntime(): ProjectRuntime<TInput, TOutput, TProof> {
    return {
      options: this.options,
      ledger: this.ledger,
      leaseManager: this.leaseManager,
      clock: this.clock,
      maxParallelism: this.maxParallelism,
      defaultMaxAttempts: this.defaultMaxAttempts,
    }
  }
}

interface ProjectRuntime<TInput, TOutput, TProof> {
  readonly options: ProjectOrchestratorOptions<TInput, TOutput, TProof>
  readonly ledger: ProjectLedger
  readonly leaseManager: ProjectResourceLeaseManager
  readonly clock: ProjectOrchestratorClock
  readonly maxParallelism: number
  readonly defaultMaxAttempts: number
}

class ProjectRunController<TInput, TOutput, TProof> {
  readonly handle: ProjectRunHandle<TOutput, TProof>
  private readonly runtime: ProjectRuntime<TInput, TOutput, TProof>
  private readonly definition: ProjectRunDefinition<TInput>
  private readonly tasks: TaskRuntime<TInput, TOutput, TProof>[]
  private readonly listeners = new Set<ProjectRunListener<TOutput, TProof>>()
  private readonly resultPromise: Promise<ProjectRunResult<TOutput, TProof>>
  private readonly readyPromise: Promise<void>
  private resolveResult!: (result: ProjectRunResult<TOutput, TProof>) => void
  private resolveReady!: () => void
  private rejectReady!: (error: unknown) => void
  private status: ProjectRunStatus = 'pending'
  private pumping = false
  private pumpAgain = false
  private settled = false
  private runStateSequence = 0
  private initialized: Promise<void>

  constructor(
    orchestrator: ProjectOrchestrator<TInput, TOutput, TProof>,
    definition: ProjectRunDefinition<TInput>,
    recovery: ProjectRunRecoveryState | undefined,
  ) {
    this.runtime = orchestrator.getRuntime()
    this.definition = { runId: definition.runId, tasks: [...definition.tasks] }
    this.tasks = this.definition.tasks.map((task) => {
      const recovered = recoveredTaskOf(recovery?.recovered.tasks ?? [], task.id)
      return {
        task,
        status: recovered?.status ?? 'pending',
        attempts: recovered?.attempts ?? 0,
        output: undefined,
        error: recovered?.lastError,
        verification: undefined,
        lease: undefined,
        worker: undefined,
        cancelRequested: false,
      }
    })
    if (recovery !== undefined) this.status = recovery.recovered.status
    this.resultPromise = new Promise((resolve) => {
      this.resolveResult = resolve
    })
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    this.handle = {
      runId: definition.runId,
      ready: this.readyPromise,
      result: this.resultPromise,
      snapshot: () => this.snapshot(),
      subscribe: (listener) => {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      },
      pause: async () => this.pause(),
      resume: async () => this.resume(),
      cancel: async (reason?: string) => this.cancel(reason),
    }
    this.initialized = this.initialize(recovery)
    void this.initialized.catch((error: unknown) => {
      this.rejectReady(error)
      this.failInfrastructure(error)
    })
  }

  private async initialize(recovery: ProjectRunRecoveryState | undefined): Promise<void> {
    if (recovery === undefined) {
      await this.appendRunEvent('run-created', 'created')
      this.status = 'running'
      await this.appendRunState('running')
    } else if (this.status === 'running' || this.status === 'recovering' || this.status === 'cancelling') {
      this.status = 'recovering'
      await this.appendRunState('recovering')
      this.status = 'running'
      await this.appendRunState('running', undefined, 'recovered-running')
    }
    await this.pump()
    if (!this.settled) this.resolveReady()
  }

  private snapshot(): ProjectRunSnapshot<TOutput, TProof> {
    return {
      runId: this.definition.runId,
      status: this.status,
      tasks: this.tasks.map((runtime) => {
        const task: ProjectTaskSnapshot<TOutput, TProof> = {
          id: runtime.task.id,
          status: runtime.status,
          attempts: runtime.attempts,
          ...(runtime.output === undefined ? {} : { output: runtime.output }),
          ...(runtime.error === undefined ? {} : { error: runtime.error }),
          ...(runtime.verification === undefined ? {} : { verification: runtime.verification }),
          ...(runtime.lease === undefined ? {} : { lease: runtime.lease }),
        }
        return task
      }),
    }
  }

  private publish(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) {
      try {
        listener(snapshot)
      } catch {
        // Un listener de observación no puede alterar la ejecución del run.
      }
    }
  }

  private async pause(): Promise<void> {
    await this.initialized
    if (this.status !== 'running') return
    this.status = 'paused'
    await this.appendRunState('paused')
    this.publish()
  }

  private async resume(): Promise<void> {
    await this.initialized
    if (this.status !== 'paused') return
    this.status = 'running'
    await this.appendRunState('running')
    this.publish()
    await this.pump()
  }

  private async cancel(reason = 'cancelado por el consumidor'): Promise<void> {
    await this.initialized
    if (this.settled || this.status === 'cancelling') return
    this.status = 'cancelling'
    await this.appendRunState('cancelling', { reason })
    for (const runtime of this.tasks) {
      if (runtime.worker !== undefined && !isTerminal(runtime.status)) {
        runtime.cancelRequested = true
        runtime.worker.cancel(reason)
      } else if (!isTerminal(runtime.status)) {
        await this.transitionTask(runtime, 'cancelled', { reason })
      }
    }
    await this.pump()
  }

  private async pump(): Promise<void> {
    if (this.pumping) {
      this.pumpAgain = true
      return
    }
    this.pumping = true
    try {
      let shouldPumpAgain = true
      while (shouldPumpAgain) {
        this.pumpAgain = false
        await this.pumpOnce()
        shouldPumpAgain = this.pumpAgain
      }
    } finally {
      this.pumping = false
    }
  }

  private async pumpOnce(): Promise<void> {
    if (this.status === 'running') {
      for (const runtime of this.tasks) {
        if (runtime.status !== 'pending') continue
        if (runtime.task.dependsOn.some(dependency => this.taskById(dependency).status === 'failed' || this.taskById(dependency).status === 'blocked' || this.taskById(dependency).status === 'cancelled')) {
          await this.transitionTask(runtime, 'blocked', { reason: 'dependencia no exitosa' })
        } else if (runtime.task.dependsOn.every(dependency => this.taskById(dependency).status === 'succeeded')) {
          await this.transitionTask(runtime, 'ready')
        }
      }
      while (this.activeCount() < this.runtime.maxParallelism) {
        let candidate: TaskRuntime<TInput, TOutput, TProof> | undefined
        let lease: ProjectLease | undefined
        for (const runtime of this.tasks) {
          if (runtime.status !== 'ready') continue
          const acquired = this.runtime.leaseManager.tryAcquire({
            runId: this.definition.runId,
            taskId: runtime.task.id,
            writeScopes: runtime.task.writeScopes,
            resourceClaims: runtime.task.resourceClaims,
          })
          if (acquired !== undefined) {
            candidate = runtime
            lease = acquired
            break
          }
        }
        if (candidate === undefined || lease === undefined) break
        await this.launch(candidate, lease)
      }
    }
    await this.finishIfPossible()
  }

  private async launch(runtime: TaskRuntime<TInput, TOutput, TProof>, lease: ProjectLease): Promise<void> {
    runtime.lease = lease
    runtime.attempts += 1
    runtime.cancelRequested = false
    await this.appendLeaseEvent(runtime, 'lease-acquired', lease)
    await this.transitionTask(runtime, 'leased')
    await this.transitionTask(runtime, 'running')
    try {
      const worker = new ProjectWorkerRunner(this.runtime.options.worker).start({
        runId: this.definition.runId,
        task: runtime.task,
        input: runtime.task.input,
        attempt: runtime.attempts,
        lease,
      })
      runtime.worker = worker
      void worker.result.then(
        result => this.settleWorker(runtime, result),
        (error: unknown) => this.settleWorker(runtime, undefined, error),
      ).catch((settlementError: unknown) => {
        this.failInfrastructure(settlementError)
      })
    } catch (error: unknown) {
      await this.failAttempt(runtime, renderError(error), true)
      await this.pump()
    }
  }

  private async settleWorker(
    runtime: TaskRuntime<TInput, TOutput, TProof>,
    result?: ProjectWorkerResult<TOutput>,
    error?: unknown,
  ): Promise<void> {
    if (runtime.worker === undefined) return
    runtime.worker = undefined
    if (runtime.cancelRequested || this.status === 'cancelling' || this.status === 'cancelled') {
      await this.release(runtime)
      await this.transitionTask(runtime, 'cancelled', { reason: 'cancelación completada' })
      await this.pump()
      return
    }
    if (error !== undefined || result === undefined) {
      await this.failAttempt(runtime, renderError(error ?? new Error('worker sin resultado')), true)
      await this.pump()
      return
    }
    await this.transitionTask(runtime, 'verifying')
    try {
      const verification = await this.runtime.options.verifier.verify({
        runId: this.definition.runId,
        task: runtime.task,
        attempt: runtime.attempts,
        result,
      })
      runtime.verification = verification
      await this.appendVerification(runtime, verification)
      if (verification.verified) {
        runtime.output = result.output
        runtime.error = undefined
        await this.release(runtime)
        await this.transitionTask(runtime, 'succeeded')
      } else {
        await this.failAttempt(runtime, verification.reason, verification.retryable)
      }
    } catch (verificationError: unknown) {
      await this.failAttempt(runtime, `verificación falló: ${renderError(verificationError)}`, true)
    }
    await this.pump()
  }

  private async failAttempt(runtime: TaskRuntime<TInput, TOutput, TProof>, reason: string, retryable: boolean): Promise<void> {
    runtime.error = reason
    const maxAttempts = runtime.task.maxAttempts ?? this.runtime.defaultMaxAttempts
    await this.release(runtime)
    if (retryable && runtime.attempts < maxAttempts && this.status === 'running') {
      await this.transitionTask(runtime, 'retrying', { error: reason })
      await this.transitionTask(runtime, 'ready', { error: reason })
    } else {
      await this.transitionTask(runtime, 'failed', { error: reason })
    }
  }

  private async release(runtime: TaskRuntime<TInput, TOutput, TProof>): Promise<void> {
    if (runtime.lease === undefined) return
    const lease = runtime.lease
    runtime.lease = undefined
    this.runtime.leaseManager.release(lease.id)
    await this.appendLeaseEvent(runtime, 'lease-released', lease)
  }

  private async finishIfPossible(): Promise<void> {
    if (this.settled || this.tasks.some(runtime => !isTerminal(runtime.status) || runtime.worker !== undefined)) return
    const hasFailure = this.tasks.some(runtime => runtime.status === 'failed' || runtime.status === 'blocked')
    const finalStatus: ProjectRunResult<TOutput, TProof>['status'] = this.status === 'cancelling' ? 'cancelled' : hasFailure ? 'failed' : 'succeeded'
    this.status = finalStatus
    await this.appendRunState(finalStatus)
    this.settled = true
    this.publish()
    this.resolveResult({ ...this.snapshot(), status: finalStatus })
  }

  private async transitionTask(
    runtime: TaskRuntime<TInput, TOutput, TProof>,
    status: ProjectTaskStatus,
    details?: Readonly<Record<string, ProjectLedgerValue>>,
  ): Promise<void> {
    runtime.status = status
    await this.runtime.ledger.append({
      idempotencyKey: `${this.definition.runId}:task:${runtime.task.id}:attempt:${runtime.attempts}:state:${status}`,
      runId: this.definition.runId,
      type: 'task-state',
      taskId: runtime.task.id,
      attempt: runtime.attempts,
      status,
      at: this.runtime.clock.now(),
      ...(details === undefined ? {} : { details }),
    })
    this.publish()
  }

  private async appendRunEvent(type: 'run-created', status: 'created'): Promise<void> {
    await this.runtime.ledger.append({
      idempotencyKey: `${this.definition.runId}:${type}`,
      runId: this.definition.runId,
      type,
      at: this.runtime.clock.now(),
      details: { status },
    })
  }

  private async appendRunState(
    status: ProjectRunStatus,
    extra?: Readonly<Record<string, ProjectLedgerValue>>,
    keySuffix: string = status,
  ): Promise<void> {
    this.runStateSequence += 1
    await this.runtime.ledger.append({
      idempotencyKey: `${this.definition.runId}:run-state:${keySuffix}-${this.runStateSequence}`,
      runId: this.definition.runId,
      type: 'run-state',
      status,
      at: this.runtime.clock.now(),
      ...(extra === undefined ? {} : { details: extra }),
    })
    this.publish()
  }

  private async appendLeaseEvent(
    runtime: TaskRuntime<TInput, TOutput, TProof>,
    type: 'lease-acquired' | 'lease-released',
    lease: ProjectLease,
  ): Promise<void> {
    await this.runtime.ledger.append({
      idempotencyKey: `${this.definition.runId}:task:${runtime.task.id}:attempt:${runtime.attempts}:lease:${type}`,
      runId: this.definition.runId,
      type,
      taskId: runtime.task.id,
      attempt: runtime.attempts,
      at: this.runtime.clock.now(),
      details: { leaseId: lease.id },
    })
  }

  private async appendVerification(
    runtime: TaskRuntime<TInput, TOutput, TProof>,
    verification: ProjectVerification<TProof>,
  ): Promise<void> {
    await this.runtime.ledger.append({
      idempotencyKey: `${this.definition.runId}:task:${runtime.task.id}:attempt:${runtime.attempts}:verification`,
      runId: this.definition.runId,
      type: 'verification',
      taskId: runtime.task.id,
      attempt: runtime.attempts,
      at: this.runtime.clock.now(),
      details: verification.verified
        ? { verified: true }
        : { verified: false, reason: verification.reason, retryable: verification.retryable },
    })
  }

  private taskById(taskId: ProjectTaskId): TaskRuntime<TInput, TOutput, TProof> {
    const runtime = this.tasks.find(candidate => candidate.task.id === taskId)
    if (runtime === undefined) throw new Error(`tarea no encontrada: ${taskId}`)
    return runtime
  }

  private activeCount(): number {
    return this.tasks.filter(runtime => runtime.worker !== undefined).length
  }

  private failInfrastructure(error: unknown): void {
    if (this.settled) return
    for (const runtime of this.tasks) {
      runtime.worker?.cancel('fallo de infraestructura')
      runtime.worker = undefined
      if (!isTerminal(runtime.status)) runtime.status = 'failed'
    }
    this.status = 'failed'
    this.settled = true
    this.resolveResult({ ...this.snapshot(), status: 'failed' })
    void error
  }
}

export { projectTaskId }
