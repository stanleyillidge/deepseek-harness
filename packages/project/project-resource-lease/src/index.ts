// Visión general del proceso:
// Este módulo administra leases en memoria y decide de forma determinista si una tarea puede
// ocupar sus recursos. Una adquisición es atómica: todos los scopes y claims se comprueban
// contra los leases vigentes antes de publicar un nuevo lease.
//
// Detalle paso a paso:
// 1. Se normalizan scopes y claims para que equivalentes textuales produzcan el mismo recurso.
// 2. Se eliminan leases expirados y se calculan conflictos contra los leases restantes.
// 3. Si no hay conflicto, se crea el lease con TTL; si lo hay, se devuelve undefined.
// 4. Renovar y liberar exigen el identificador del lease y son seguros frente a repetición.

import type {
  ProjectLease,
  ProjectLeaseClock,
  ProjectLeaseId,
  ProjectLeaseRequest,
  ProjectResourceConflict,
  ProjectResourceLeaseOptions,
  ProjectRunId,
  ProjectTaskId,
} from './types.ts'

export type {
  ProjectLease,
  ProjectLeaseClock,
  ProjectLeaseId,
  ProjectLeaseRequest,
  ProjectResourceConflict,
  ProjectResourceLeaseOptions,
  ProjectRunId,
  ProjectTask,
  ProjectTaskId,
} from './types.ts'

const DEFAULT_TTL_MS = 30_000

const systemClock: ProjectLeaseClock = {
  now: () => Date.now(),
}

let nextLeaseNumber = 0

/**
 * Convierte un texto de run al identificador opaco correspondiente.
 * @param value - texto que identifica el run.
 * @returns identificador validado.
 */
export function projectRunId(value: string): ProjectRunId {
  if (value.trim().length === 0) throw new Error('projectRunId requiere un valor no vacío')
  return value as ProjectRunId
}

/**
 * Convierte un texto de tarea al identificador opaco correspondiente.
 * @param value - texto que identifica la tarea.
 * @returns identificador validado.
 */
export function projectTaskId(value: string): ProjectTaskId {
  if (value.trim().length === 0) throw new Error('projectTaskId requiere un valor no vacío')
  return value as ProjectTaskId
}

/**
 * Convierte un texto de lease al identificador opaco correspondiente.
 * @param value - texto que identifica el lease.
 * @returns identificador validado.
 */
export function projectLeaseId(value: string): ProjectLeaseId {
  if (value.trim().length === 0) throw new Error('projectLeaseId requiere un valor no vacío')
  return value as ProjectLeaseId
}

/**
 * Normaliza un scope de escritura relativo al workspace.
 * @param value - scope recibido por el consumidor.
 * @returns scope con separadores y prefijos equivalentes normalizados.
 */
export function normalizeProjectWriteScope(value: string): string {
  const normalized = value.trim().replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/+/gu, '/')
  const withoutTrailingSlash = normalized.replace(/\/$/u, '')
  if (withoutTrailingSlash.length === 0 || withoutTrailingSlash.split('/').includes('..')) {
    throw new Error(`scope de escritura inválido: ${value}`)
  }
  return withoutTrailingSlash
}

/**
 * Normaliza un claim de recurso para compararlo por igualdad exacta.
 * @param value - claim recibido por el consumidor.
 * @returns claim sin espacios exteriores.
 */
export function normalizeProjectResourceClaim(value: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error('un resourceClaim no puede estar vacío')
  return normalized
}

function uniqueNormalized(values: readonly string[], normalize: (value: string) => string): string[] {
  return [...new Set(values.map(normalize))].sort()
}

function scopesOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`)
}

function defaultLeaseIdFactory(): ProjectLeaseId {
  nextLeaseNumber += 1
  return projectLeaseId(`lease-${nextLeaseNumber}`)
}

/**
 * Administra leases efímeros de escritura y recursos exclusivos.
 * La clase no conoce workers, jobs ni subagents; solo posee el estado de reserva.
 */
export class ProjectResourceLeaseManager {
  private readonly ttlMs: number
  private readonly clock: ProjectLeaseClock
  private readonly leaseIdFactory: () => ProjectLeaseId
  private readonly leases = new Map<ProjectLeaseId, ProjectLease>()

  /**
   * Crea un administrador de leases.
   * @param options - TTL, reloj y generador de IDs inyectables.
   */
  constructor(options: ProjectResourceLeaseOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    if (!Number.isFinite(this.ttlMs) || this.ttlMs <= 0) throw new Error('ttlMs debe ser un número positivo')
    this.clock = options.clock ?? systemClock
    this.leaseIdFactory = options.leaseIdFactory ?? defaultLeaseIdFactory
  }

  /**
   * Intenta reservar todos los recursos de una tarea en una operación atómica.
   * @param request - identidad de la tarea y recursos que quiere ocupar.
   * @returns lease creado o undefined cuando existe un conflicto vigente.
   */
  tryAcquire(request: ProjectLeaseRequest): ProjectLease | undefined {
    this.removeExpired()
    const conflicts = this.conflicts(request)
    if (conflicts.length > 0) return undefined
    const acquiredAt = this.clock.now()
    const lease: ProjectLease = {
      id: this.leaseIdFactory(),
      runId: request.runId,
      taskId: request.taskId,
      writeScopes: uniqueNormalized(request.writeScopes, normalizeProjectWriteScope),
      resourceClaims: uniqueNormalized(request.resourceClaims, normalizeProjectResourceClaim),
      acquiredAt,
      expiresAt: acquiredAt + this.ttlMs,
    }
    this.leases.set(lease.id, lease)
    return lease
  }

  /**
   * Expone los conflictos actuales de una solicitud sin modificar leases no expirados.
   * @param request - recursos que se desean reservar.
   * @returns conflictos ordenados por lease y recurso.
   */
  conflicts(request: ProjectLeaseRequest): readonly ProjectResourceConflict[] {
    this.removeExpired()
    const writeScopes = uniqueNormalized(request.writeScopes, normalizeProjectWriteScope)
    const resourceClaims = uniqueNormalized(request.resourceClaims, normalizeProjectResourceClaim)
    const conflicts: ProjectResourceConflict[] = []
    for (const lease of this.leases.values()) {
      if (lease.runId === request.runId && lease.taskId === request.taskId) continue
      for (const scope of writeScopes) {
        if (lease.writeScopes.some(heldScope => scopesOverlap(scope, heldScope))) {
          conflicts.push({ kind: 'writeScope', value: scope, withTaskId: lease.taskId, leaseId: lease.id })
        }
      }
      for (const claim of resourceClaims) {
        if (lease.resourceClaims.includes(claim)) {
          conflicts.push({ kind: 'resourceClaim', value: claim, withTaskId: lease.taskId, leaseId: lease.id })
        }
      }
    }
    return conflicts.sort((left, right) => left.leaseId.localeCompare(right.leaseId) || left.value.localeCompare(right.value))
  }

  /**
   * Renueva un lease vigente y devuelve su nueva fecha de expiración.
   * @param leaseId - lease que se desea renovar.
   * @returns lease actualizado.
   */
  renew(leaseId: ProjectLeaseId): ProjectLease {
    this.removeExpired()
    const current = this.leases.get(leaseId)
    if (current === undefined) throw new Error(`lease no vigente: ${leaseId}`)
    const renewed: ProjectLease = { ...current, expiresAt: this.clock.now() + this.ttlMs }
    this.leases.set(leaseId, renewed)
    return renewed
  }

  /**
   * Libera un lease; repetir la liberación no produce un error.
   * @param leaseId - lease que se desea liberar.
   */
  release(leaseId: ProjectLeaseId): void {
    this.leases.delete(leaseId)
  }

  /**
   * Indica si un lease existe y aún no expiró.
   * @param leaseId - lease que se desea consultar.
   * @returns true cuando el lease sigue vigente.
   */
  isValid(leaseId: ProjectLeaseId): boolean {
    this.removeExpired()
    return this.leases.has(leaseId)
  }

  /**
   * Devuelve los leases vigentes en orden de ID.
   * @returns copia ordenada de los leases activos.
   */
  activeLeases(): readonly ProjectLease[] {
    this.removeExpired()
    return [...this.leases.values()].sort((left, right) => left.id.localeCompare(right.id))
  }

  private removeExpired(): void {
    const now = this.clock.now()
    for (const [leaseId, lease] of this.leases) {
      if (lease.expiresAt <= now) this.leases.delete(leaseId)
    }
  }
}
