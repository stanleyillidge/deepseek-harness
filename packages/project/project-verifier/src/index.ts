// Visión general del proceso:
// Este módulo contiene el contrato y una implementación de callback para la verificación
// explícita. La orquestación debe invocar verify antes de marcar una tarea como succeeded;
// producir una salida no equivale a haberla validado.
//
// Detalle paso a paso:
// 1. Se exportan los tipos de la solicitud y de la decisión discriminada.
// 2. Se ofrece un adaptador pequeño para funciones de dominio existentes.
// 3. No se importan APIs de Subagents, Jobs ni almacenamiento.

import type {
  ProjectVerification,
  ProjectVerificationRequest,
  ProjectVerifier,
} from './types.ts'

export type {
  ProjectVerification,
  ProjectVerificationFailure,
  ProjectVerificationRequest,
  ProjectVerificationSuccess,
  ProjectVerifier,
} from './types.ts'

/** Verificador construido desde una función de dominio inyectada. */
export class ProjectCallbackVerifier<TInput, TOutput, TProof> implements ProjectVerifier<TInput, TOutput, TProof> {
  /**
   * Crea un verificador explícito.
   * @param callback - función que debe devolver una decisión discriminada.
   */
  constructor(
    private readonly callback: (request: ProjectVerificationRequest<TInput, TOutput>) => Promise<ProjectVerification<TProof>>,
  ) {}

  /**
   * Ejecuta la decisión de dominio para un resultado de worker.
   * @param request - resultado que el dominio debe aceptar o rechazar.
   * @returns decisión explícita del callback.
   */
  verify(request: ProjectVerificationRequest<TInput, TOutput>): Promise<ProjectVerification<TProof>> {
    return this.callback(request)
  }
}
