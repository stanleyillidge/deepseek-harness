// Visión general del proceso:
// Este módulo encapsula operaciones Git sobre un worktree local y sobre su remoto asociado.
// Recibe un ejecutor explícito, conserva la ruta del checkout, sanitiza diagnósticos y mantiene
// `push` deshabilitado hasta que la política del consumidor lo habilite.
//
// Detalle paso a paso:
// 1. Cada operación construye `argv` y `cwd` sin pasar por un shell global.
// 2. Las lecturas inspeccionan el checkout sin limpiar, resetear ni cambiar de rama.
// 3. Las escrituras locales se limitan a las llamadas solicitadas por el consumidor.
// 4. `push` exige opt-in y además respeta las ramas protegidas configuradas.

import { dirname } from 'node:path'
import type {
  CloneRepositoryOptions,
  ProjectRepositoryOptions,
  RepositoryBranch,
  RepositoryCommitOptions,
  RepositoryCommand,
  RepositoryCommandResult,
  RepositoryCreateBranchOptions,
  RepositoryDiffOptions,
  RepositoryExecutor,
  RepositoryFetchOptions,
  RepositoryInspection,
  RepositoryPolicy,
  RepositoryPushOptions,
  RepositoryStatus,
  RepositoryStatusEntry,
} from './types.ts'

export type {
  CloneRepositoryOptions,
  LocalRepositorySource,
  ProjectRepositoryOptions,
  RemoteRepositorySource,
  RepositoryBranch,
  RepositoryCommitOptions,
  RepositoryCommand,
  RepositoryCommandResult,
  RepositoryCreateBranchOptions,
  RepositoryDiffOptions,
  RepositoryExecutor,
  RepositoryFetchOptions,
  RepositoryInspection,
  RepositoryPolicy,
  RepositoryPushOptions,
  RepositorySource,
  RepositoryStatus,
  RepositoryStatusEntry,
} from './types.ts'

/** Ramas protegidas por defecto en ausencia de una política del consumidor. */
export const DEFAULT_PROTECTED_BRANCHES = ['main', 'master'] as const

/** Error de una orden Git o de un ejecutor que no pudo completarla. */
export class RepositoryCommandError extends Error {
  /** Código de salida, cuando Git llegó a ejecutarse. */
  readonly exitCode: number | undefined
  /** Salida estándar ya sanitizada. */
  readonly stdout: string
  /** Error estándar ya sanitizado. */
  readonly stderr: string

  /**
   * @param message - diagnóstico seguro para el consumidor.
   * @param result - resultado de Git, si existe.
   */
  constructor(message: string, result?: RepositoryCommandResult) {
    super(message)
    this.name = 'RepositoryCommandError'
    this.exitCode = result?.exitCode
    this.stdout = result?.stdout ?? ''
    this.stderr = result?.stderr ?? ''
  }
}

/** Error específico de una operación `push` deshabilitada o protegida. */
export class RepositoryPushBlockedError extends Error {
  /**
   * @param reason - explicación segura del bloqueo.
   */
  constructor(reason: string) {
    super(`repository push blocked: ${reason}`)
    this.name = 'RepositoryPushBlockedError'
  }
}

const SECRET_PATTERNS = [
  /((?:https?|ssh):\/\/)[^\s/@]+@/giu,
  /((?:authorization|proxy-authorization)\s*:\s*bearer\s+)[^\s,;]+/giu,
  /((?:bearer|token|password|secret|api[-_]?key)\s*[=:]\s*)[^\s,;&]+/giu,
  /(\b(?:ghp|gho|ghs|ghr|glpat|github_pat|sk)-)[A-Za-z0-9_-]+/gu,
] as const

/**
 * Sustituye credenciales conocidas y valores secretos declarados por el caller.
 * @param value - texto que puede contener un diagnóstico de Git.
 * @param secretValues - secretos explícitos que también deben ocultarse.
 * @returns texto apto para exponer como diagnóstico.
 */
export function redactSensitiveText(value: string, secretValues: readonly string[] = []): string {
  let redacted = value
  for (const secret of secretValues) {
    if (secret !== '') redacted = redacted.replaceAll(secret, '[REDACTED_SECRET]')
  }
  for (const pattern of SECRET_PATTERNS) redacted = redacted.replace(pattern, '$1[REDACTED_SECRET]')
  return redacted
}

function requireValue(value: string, label: string): string {
  if (value.trim() === '') throw new TypeError(`repository ${label} must not be empty`)
  if (value.includes('\u0000')) throw new TypeError(`repository ${label} must not contain NUL`)
  return value
}

function safeRef(value: string, label: string): string {
  requireValue(value, label)
  if (value.startsWith('-') || value.includes(' ') || value.includes('\t') || value.includes('~')
    || value.includes('^') || value.includes(':') || value.includes('?') || value.includes('*')
    || value.includes('\\') || value.includes('[') || value.includes(']') || value.includes('..')) {
    throw new TypeError(`repository ${label} is not a safe Git ref`)
  }
  return value
}

/**
 * Repositorio Git local que puede apuntar a un remoto sin ejecutar ninguna orden por sí mismo.
 * El worktree no se limpia, no se cambia de rama automáticamente y conserva exactamente la ruta
 * recibida por el consumidor.
 */
export class ProjectRepository {
  readonly path: string
  readonly executor: RepositoryExecutor
  readonly policy: Required<Pick<RepositoryPolicy, 'protectedBranches' | 'allowPush' | 'allowProtectedBranchPush'>> & Pick<RepositoryPolicy, 'secretValues'>
  readonly remoteUrl: string | undefined

  /**
   * @param options - worktree, ejecutor y política local.
   */
  constructor(options: ProjectRepositoryOptions) {
    this.path = requireValue(options.path, 'path')
    this.executor = options.executor
    this.policy = {
      protectedBranches: options.policy?.protectedBranches ?? DEFAULT_PROTECTED_BRANCHES,
      allowPush: options.policy?.allowPush ?? false,
      allowProtectedBranchPush: options.policy?.allowProtectedBranchPush ?? false,
      ...(options.policy?.secretValues === undefined ? {} : { secretValues: options.policy.secretValues }),
    }
    this.remoteUrl = options.remoteUrl === undefined ? undefined : redactSensitiveText(options.remoteUrl, this.policy.secretValues)
  }

  /**
   * Clona un remoto en un worktree sin sobrescribir un destino existente.
   * @param options - URL, ruta exacta, ejecutor y señal opcional.
   * @returns repositorio listo para inspección en el worktree clonado.
   */
  static async clone(options: CloneRepositoryOptions): Promise<ProjectRepository> {
    requireValue(options.url, 'remote URL')
    const path = requireValue(options.path, 'path')
    const policy = options.policy
    const executor = options.executor
    const command: RepositoryCommand = {
      argv: ['git', 'clone', '--no-tags', '--', options.url, path],
      cwd: dirname(path) || '.',
    }
    await ProjectRepository.runCommand(executor, command, options.signal, policy?.secretValues)
    return new ProjectRepository({ ...options, path, remoteUrl: options.url })
  }

  /**
   * Clona un remoto usando el ejecutor y la política de este objeto.
   * @param url - URL o referencia remota que Git debe clonar.
   * @param destination - worktree de destino; por defecto la ruta del objeto.
   * @param signal - cancelación opcional.
   * @returns repositorio asociado al worktree clonado.
   */
  async clone(url: string, destination = this.path, signal?: AbortSignal): Promise<ProjectRepository> {
    return await ProjectRepository.clone({
      url,
      path: destination,
      executor: this.executor,
      policy: this.policy,
      ...(signal === undefined ? {} : { signal }),
    })
  }

  /**
   * Inspecciona raíz, rama, estado y `origin` sin modificar el checkout.
   * @param signal - cancelación opcional.
   * @returns estado combinado del repositorio.
   */
  async inspect(signal?: AbortSignal): Promise<RepositoryInspection> {
    const root = (await this.run(['rev-parse', '--show-toplevel'], signal)).stdout.trim()
    const status = await this.status(signal)
    const remoteUrl = await this.optional(['remote', 'get-url', 'origin'], signal)
    const branch = this.branchFromStatus(status)
    return { root, path: this.path, branch, status, remoteUrl }
  }

  /**
   * Lee la rama actual y su política de protección.
   * @param signal - cancelación opcional.
   * @returns rama actual o detached HEAD.
   */
  async branch(signal?: AbortSignal): Promise<RepositoryBranch> {
    const name = (await this.run(['branch', '--show-current'], signal)).stdout.trim()
    return this.branchInfo(name === '' ? undefined : name)
  }

  /**
   * Crea una referencia de rama local sin hacer checkout ni tocar archivos sucios.
   * @param options - nombre, punto de partida y señal opcional.
   * @returns la rama creada.
   */
  async createBranch(options: RepositoryCreateBranchOptions): Promise<RepositoryBranch> {
    const name = safeRef(options.name, 'branch name')
    const startPoint = options.startPoint === undefined ? undefined : safeRef(options.startPoint, 'start point')
    await this.run(['branch', name, ...(startPoint === undefined ? [] : [startPoint])], options.signal)
    return this.branchInfo(name)
  }

  /**
   * Obtiene los cambios del remoto seleccionado sin escribir en el remoto ni limpiar el worktree.
   * @param options - remoto y señal opcionales.
   * @returns resultado sanitizado de Git.
   */
  async fetch(options: RepositoryFetchOptions = {}): Promise<RepositoryCommandResult> {
    const remote = safeRef(options.remote ?? 'origin', 'remote')
    return await this.run(['fetch', '--no-tags', remote], options.signal)
  }

  /**
   * Lee el estado porcelain del checkout, incluyendo cambios no staged, staged y no rastreados.
   * @param signal - cancelación opcional.
   * @returns estado y entradas del worktree sin alterar.
   */
  async status(signal?: AbortSignal): Promise<RepositoryStatus> {
    const output = (await this.run(['status', '--porcelain=v1', '--branch'], signal)).stdout
    const lines = output.split(/\r?\n/u).filter(line => line !== '')
    const branchLine = lines.find(line => line.startsWith('## '))
    const rawBranch = branchLine?.slice(3).split('...')[0]
    const branch = rawBranch === undefined || rawBranch === 'HEAD (no branch)' ? undefined : rawBranch
    const entries: RepositoryStatusEntry[] = lines
      .filter(line => !line.startsWith('## '))
      .map(line => ({ code: line.slice(0, 2), path: line.slice(3) }))
    return { branch, dirty: entries.length > 0, entries }
  }

  /**
   * Obtiene un diff local sin aplicar cambios.
   * @param options - modo staged, ruta y señal opcionales.
   * @returns diff sanitizado de Git.
   */
  async diff(options: RepositoryDiffOptions & { readonly signal?: AbortSignal } = {}): Promise<string> {
    const args = ['diff', ...(options.staged === true ? ['--cached'] : [])]
    if (options.path !== undefined) args.push('--', requireValue(options.path, 'diff path'))
    return (await this.run(args, options.signal)).stdout
  }

  /**
   * Crea un commit local con los cambios que Git tenga staged.
   * @param options - mensaje y señal opcional.
   * @returns resultado sanitizado de Git.
   */
  async commit(options: RepositoryCommitOptions): Promise<RepositoryCommandResult> {
    const message = requireValue(options.message, 'commit message')
    return await this.run(['commit', '--message', message], options.signal)
  }

  /**
   * Envía la rama actual o indicada al remoto solo con opt-in de política.
   * No acepta force-push y rechaza ramas protegidas salvo opt-in separado.
   * @param options - remoto, rama y señal opcionales.
   * @returns resultado sanitizado de Git.
   */
  async push(options: RepositoryPushOptions = {}): Promise<RepositoryCommandResult> {
    if (!this.policy.allowPush) throw new RepositoryPushBlockedError('push is disabled by policy')
    const remote = safeRef(options.remote ?? 'origin', 'remote')
    const branch = options.branch ?? (await this.branch()).name
    if (branch === undefined) throw new RepositoryPushBlockedError('detached HEAD has no branch to push')
    safeRef(branch, 'branch')
    if (this.policy.protectedBranches.includes(branch) && !this.policy.allowProtectedBranchPush) {
      throw new RepositoryPushBlockedError(`branch '${branch}' is protected`)
    }
    return await this.run(['push', '--porcelain', remote, branch], options.signal)
  }

  private branchFromStatus(status: RepositoryStatus): RepositoryBranch {
    return this.branchInfo(status.branch)
  }

  private branchInfo(name: string | undefined): RepositoryBranch {
    return { name, protected: name !== undefined && this.policy.protectedBranches.includes(name) }
  }

  private async optional(args: readonly string[], signal?: AbortSignal): Promise<string | undefined> {
    try {
      return (await this.run(args, signal)).stdout.trim() || undefined
    } catch (_optionalInspectionFailure) {
      return undefined
    }
  }

  private async run(args: readonly string[], signal?: AbortSignal): Promise<RepositoryCommandResult> {
    return await ProjectRepository.runCommand(this.executor, { argv: ['git', ...args], cwd: this.path }, signal, this.policy.secretValues)
  }

  private static async runCommand(
    executor: RepositoryExecutor,
    command: RepositoryCommand,
    signal: AbortSignal | undefined,
    secretValues: readonly string[] = [],
  ): Promise<RepositoryCommandResult> {
    try {
      const result = await executor.execute(command, signal)
      const sanitized = {
        ...result,
        stdout: redactSensitiveText(result.stdout, secretValues),
        stderr: redactSensitiveText(result.stderr, secretValues),
      }
      if (result.exitCode !== 0) {
        throw new RepositoryCommandError(
          `git command failed with exit code ${String(result.exitCode)}: ${sanitized.stderr || sanitized.stdout}`,
          sanitized,
        )
      }
      return sanitized
    } catch (error) {
      if (error instanceof RepositoryCommandError) throw error
      const message = error instanceof Error ? error.message : String(error)
      throw new RepositoryCommandError(redactSensitiveText(message, secretValues))
    }
  }
}

export default ProjectRepository
