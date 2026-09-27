/** Tipos públicos para operaciones controladas sobre repositorios Git. */

/** Orden Git que un ejecutor debe ejecutar sin interpretar un shell. */
export interface RepositoryCommand {
  /** Argumentos completos, incluido el ejecutable en la posición cero. */
  readonly argv: readonly string[]
  /** Checkout que debe recibir la orden como directorio de trabajo. */
  readonly cwd: string
}

/** Resultado de una orden Git ejecutada por el proveedor inyectado. */
export interface RepositoryCommandResult {
  /** Código de salida del proceso; cero indica éxito. */
  readonly exitCode: number
  /** Salida estándar capturada por el ejecutor. */
  readonly stdout: string
  /** Error estándar capturado por el ejecutor. */
  readonly stderr: string
}

/** Ejecuta una orden Git en el mundo de procesos elegido por el consumidor. */
export interface RepositoryExecutor {
  /**
   * Ejecuta una orden con su directorio de trabajo explícito.
   * @param command - ejecutable, argumentos y checkout de destino.
   * @param signal - cancelación opcional de la operación.
   * @returns resultado del proceso, incluidos sus flujos capturados.
   */
  execute(command: RepositoryCommand, signal?: AbortSignal): Promise<RepositoryCommandResult>
}

/** Política local de seguridad para operaciones sobre un repositorio. */
export interface RepositoryPolicy {
  /** Ramas que no pueden recibir `push` salvo opt-in adicional. */
  readonly protectedBranches?: readonly string[]
  /** Habilita explícitamente la operación remota `push`; por defecto es falso. */
  readonly allowPush?: boolean
  /** Habilita explícitamente `push` hacia las ramas protegidas. */
  readonly allowProtectedBranchPush?: boolean
  /** Valores secretos adicionales que deben desaparecer de diagnósticos. */
  readonly secretValues?: readonly string[]
}

/** Identifica el origen remoto usado para crear un checkout local. */
export interface RemoteRepositorySource {
  readonly kind: 'remote'
  readonly url: string
  readonly path: string
}

/** Identifica un checkout local ya existente. */
export interface LocalRepositorySource {
  readonly kind: 'local'
  readonly path: string
}

/** Origen local o remoto de un repositorio de proyecto. */
export type RepositorySource = LocalRepositorySource | RemoteRepositorySource

/** Opciones para abrir un checkout local. */
export interface ProjectRepositoryOptions {
  /** Ruta exacta del worktree que recibirá las órdenes Git. */
  readonly path: string
  /** Ejecutor que conoce el entorno local o remoto donde corre Git. */
  readonly executor: RepositoryExecutor
  /** Política de seguridad de este checkout. */
  readonly policy?: RepositoryPolicy
  /** URL remota conocida por el caller, sin consultarla todavía. */
  readonly remoteUrl?: string
}

/** Opciones para clonar un repositorio en un worktree nuevo. */
export interface CloneRepositoryOptions {
  /** URL o referencia pública que Git debe clonar. */
  readonly url: string
  /** Ruta exacta del worktree de destino. */
  readonly path: string
  /** Ejecutor inyectado que ejecutará `git clone`. */
  readonly executor: RepositoryExecutor
  /** Política que conservará el repositorio resultante. */
  readonly policy?: RepositoryPolicy
  /** Señal de cancelación de la clonación. */
  readonly signal?: AbortSignal
}

/** Resultado de la rama actual y de su protección local. */
export interface RepositoryBranch {
  /** Nombre de la rama o `undefined` cuando el HEAD está separado. */
  readonly name: string | undefined
  /** Indica si el nombre pertenece a la lista protegida. */
  readonly protected: boolean
}

/** Entrada resumida del estado de un checkout. */
export interface RepositoryStatusEntry {
  /** Código de dos columnas emitido por `git status --porcelain`. */
  readonly code: string
  /** Ruta que Git reportó para la entrada. */
  readonly path: string
}

/** Estado observable de un checkout sin modificar sus archivos. */
export interface RepositoryStatus {
  /** Rama actual, si el checkout no está en detached HEAD. */
  readonly branch: string | undefined
  /** Indica si existen cambios sin confirmar. */
  readonly dirty: boolean
  /** Entradas que explican la suciedad del checkout. */
  readonly entries: readonly RepositoryStatusEntry[]
}

/** Inspección combinada de la raíz, rama, estado y remoto principal. */
export interface RepositoryInspection {
  /** Ruta que Git considera raíz del repositorio. */
  readonly root: string
  /** Worktree que el consumidor configuró para la operación. */
  readonly path: string
  /** Rama actual y su política de protección. */
  readonly branch: RepositoryBranch
  /** Estado de archivos del checkout. */
  readonly status: RepositoryStatus
  /** URL del remoto `origin`, sanitizada, si existe. */
  readonly remoteUrl: string | undefined
}

/** Opciones para obtener un diff local. */
export interface RepositoryDiffOptions {
  /** Compara el índice contra HEAD en lugar del worktree contra el índice. */
  readonly staged?: boolean
  /** Limita la comparación a una ruta relativa al checkout. */
  readonly path?: string
}

/** Opciones para `fetch`, sin ninguna operación remota de escritura. */
export interface RepositoryFetchOptions {
  /** Remoto local que se actualizará; por defecto `origin`. */
  readonly remote?: string
  /** Señal de cancelación de la operación. */
  readonly signal?: AbortSignal
}

/** Opciones para crear una referencia de rama local sin cambiar el checkout. */
export interface RepositoryCreateBranchOptions {
  /** Nombre nuevo de la rama. */
  readonly name: string
  /** Punto de partida opcional; por defecto el HEAD actual. */
  readonly startPoint?: string
  /** Señal de cancelación de la operación. */
  readonly signal?: AbortSignal
}

/** Opciones para confirmar cambios locales. */
export interface RepositoryCommitOptions {
  /** Mensaje no vacío del commit. */
  readonly message: string
  /** Señal de cancelación de la operación. */
  readonly signal?: AbortSignal
}

/** Opciones para el único método que puede modificar un remoto. */
export interface RepositoryPushOptions {
  /** Remoto local que recibirá el push; por defecto `origin`. */
  readonly remote?: string
  /** Rama destino; por defecto la rama actual. */
  readonly branch?: string
  /** Señal de cancelación de la operación. */
  readonly signal?: AbortSignal
}
