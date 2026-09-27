// Visión general del proceso:
// Este archivo define la decisión explícita que separa producir un resultado de aceptarlo.
// Un verificador puede aportar evidencia y puede indicar si un rechazo permite reintento.
//
// Detalle paso a paso:
// 1. Se describe la entrada completa de la verificación.
// 2. Se modelan por separado aceptación y rechazo para impedir éxitos implícitos.
// 3. Se declara el adaptador que el orquestador invoca después de cada worker.

import type { ProjectRunId, ProjectTask } from '@deepseek-ai/dsh-project-resource-lease'
import type { ProjectWorkerResult } from '@deepseek-ai/dsh-project-worker'

/** Datos que recibe el verificador para decidir si un intento es válido. */
export interface ProjectVerificationRequest<TInput, TOutput> {
  readonly runId: ProjectRunId
  readonly task: ProjectTask<TInput>
  readonly attempt: number
  readonly result: ProjectWorkerResult<TOutput>
}

/** Decisión positiva con evidencia que puede conservarse en el resultado del run. */
export interface ProjectVerificationSuccess<TProof> {
  readonly verified: true
  readonly evidence: TProof
}

/** Decisión negativa con motivo y política explícita de reintento. */
export interface ProjectVerificationFailure {
  readonly verified: false
  readonly reason: string
  readonly retryable: boolean
}

/** Resultado discriminado de una verificación. */
export type ProjectVerification<TProof> = ProjectVerificationSuccess<TProof> | ProjectVerificationFailure

/** Adaptador de verificación que no depende del proveedor que produjo la salida. */
export interface ProjectVerifier<TInput, TOutput, TProof> {
  verify(request: ProjectVerificationRequest<TInput, TOutput>): Promise<ProjectVerification<TProof>>
}
