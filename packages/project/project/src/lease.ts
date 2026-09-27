/** Leases en memoria para recursos compartidos por workers concurrentes. */

import { randomUUID } from 'node:crypto'
import { ProjectError } from './errors.ts'
import type { ProjectResourceClaim } from './types.ts'

/** Handle idempotente de una reserva de recursos. */
export interface ProjectResourceLease {
  readonly id: string
  readonly claims: readonly ProjectResourceClaim[]
  release(): void
}

/** Registro de leases activos; no concede una reserva si existe conflicto. */
export class ProjectResourceLeaseManager {
  private readonly active = new Map<string, ProjectResourceLease>()

  /** Reserva todos los claims de forma atómica o lanza PROJECT_RESOURCE_BUSY. */
  acquire(claims: readonly ProjectResourceClaim[]): ProjectResourceLease {
    for (const existing of this.active.values()) {
      if (claims.some(claim => existing.claims.some(other => conflict(claim, other)))) {
        throw new ProjectError('one or more requested resources are busy', 'PROJECT_RESOURCE_BUSY')
      }
    }
    const id = randomUUID()
    let released = false
    const lease: ProjectResourceLease = {
      id,
      claims: claims.map(claim => ({ ...claim })),
      release: () => {
        if (released) return
        released = true
        this.active.delete(id)
      },
    }
    this.active.set(id, lease)
    return lease
  }

  /** Cantidad de reservas activas, útil para diagnósticos y pruebas. */
  get size(): number { return this.active.size }
}

function conflict(left: ProjectResourceClaim, right: ProjectResourceClaim): boolean {
  if (left.kind !== right.kind || left.key !== right.key) return false
  return left.mode !== 'shared' || right.mode !== 'shared'
}
