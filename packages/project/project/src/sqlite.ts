/**
 * Implementación SQLite de ProjectRepository. La conexión es propia de una
 * instancia, el schema se versiona con `PRAGMA user_version` y cada payload
 * se valida al abrir o leer para detectar corrupción explícitamente.
 * @module @deepseek-ai/dsh-project/sqlite
 */

import { randomUUID } from 'node:crypto'
import { mkdir, open } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { brandString } from '@deepseek-ai/dsh-brand'
import {
  ProjectClosedError,
  ProjectCorruptionError,
  ProjectDuplicateWorkspaceError,
  ProjectNotFoundError,
  ProjectRevisionConflictError,
} from './errors.ts'
import {
  validateProjectRecord,
  validateProjectRun,
  validateProjectSnapshot,
  validateProjectTask,
  validateWorker,
} from './validator.ts'
import type {
  ProjectRecordCreateInput,
  ProjectId,
  ProjectRecord,
  ProjectRepository,
  ProjectRun,
  ProjectRunCreateInput,
  ProjectStorageSnapshot,
  ProjectTask,
  ProjectTaskCreateInput,
  ProjectRecordUpdateInput,
  Worker,
  WorkerId,
  WorkerInput,
} from './types.ts'

const SQLITE_SCHEMA_VERSION = 1

interface ProjectRow { id: string; workspace: string; payload: string }
interface RunRow { id: string; payload: string }

/**
 * Repositorio SQLite para los contratos de Projects.
 *
 * La instancia se crea con {@link open}; una apertura valida todas las tablas
 * antes de devolver el repositorio. El llamador debe cerrar la instancia.
 */
export class SqliteProjectRepository implements ProjectRepository {
  private closed = false

  private constructor(private readonly database: DatabaseSync) {}

  /**
   * Abre o crea una base SQLite y valida su contenido actual.
   * @param path - Ruta de la base o `:memory:` para una base efímera.
   * @returns repositorio listo para operar.
   */
  static async open(path: string): Promise<SqliteProjectRepository> {
    const database = await openDatabase(path)
    try {
      configureDatabase(database, path)
      const repository = new SqliteProjectRepository(database)
      repository.readSnapshot()
      return repository
    } catch (error) {
      database.close()
      throw error
    }
  }

  /** Crea un proyecto con revisión inicial 1. */
  async createProject(input: ProjectRecordCreateInput): Promise<ProjectRecord> {
    await Promise.resolve()
    this.assertOpen()
    const workspace = normalizeRequired(input.workspace, 'workspace')
    const name = normalizeRequired(input.name, 'name')
    const existing = this.findProjectByWorkspaceSync(workspace)
    if (existing !== undefined) throw new ProjectDuplicateWorkspaceError(workspace, existing.id)
    const now = new Date().toISOString()
    const record = validateProjectRecord({
      id: randomUUID(), workspace, name, ...(input.description === undefined ? {} : { description: input.description }),
      createdAt: now, updatedAt: now, revision: 1,
    })
    try {
      this.database.prepare('INSERT INTO projects (id, workspace, payload, revision) VALUES (?, ?, ?, ?)')
        .run(record.id, record.workspace, JSON.stringify(record), record.revision)
    } catch (error) {
      if (isUniqueWorkspaceError(error)) {
        const owner = this.findProjectByWorkspaceSync(workspace)
        throw new ProjectDuplicateWorkspaceError(workspace, owner?.id)
      }
      throw error
    }
    return record
  }

  /** Lee un proyecto sin convertir una ausencia en excepción. */
  async getProject(id: ProjectId): Promise<ProjectRecord | undefined> {
    await Promise.resolve()
    this.assertOpen()
    return this.readProject(id)
  }

  /** Lee todos los proyectos en orden de creación descendente. */
  async listProjects(): Promise<readonly ProjectRecord[]> {
    await Promise.resolve()
    this.assertOpen()
    return this.readSnapshot().projects
      .slice()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.id.localeCompare(right.id))
  }

  /** Busca un proyecto por workspace normalizado. */
  async findProjectByWorkspace(workspace: string): Promise<ProjectRecord | undefined> {
    await Promise.resolve()
    this.assertOpen()
    return this.findProjectByWorkspaceSync(normalizeRequired(workspace, 'workspace'))
  }

  /** Actualiza un proyecto con compare-and-set sobre `revision`. */
  async updateProject(id: ProjectId, expectedRevision: number, patch: ProjectRecordUpdateInput): Promise<ProjectRecord> {
    await Promise.resolve()
    this.assertOpen()
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new TypeError('expectedRevision debe ser un entero seguro positivo')
    }
    const current = this.requireProject(id)
    if (current.revision !== expectedRevision) {
      throw new ProjectRevisionConflictError(id, expectedRevision, current)
    }
    const workspace = patch.workspace === undefined ? current.workspace : normalizeRequired(patch.workspace, 'workspace')
    const name = patch.name === undefined ? current.name : normalizeRequired(patch.name, 'name')
    const description = patch.description === null ? undefined : patch.description ?? current.description
    const updated = validateProjectRecord({
      id: current.id,
      workspace,
      name,
      createdAt: current.createdAt,
      ...(description === undefined ? {} : { description }),
      updatedAt: new Date().toISOString(),
      revision: current.revision + 1,
    })
    try {
      const result = this.database.prepare(
        'UPDATE projects SET workspace = ?, payload = ?, revision = ? WHERE id = ? AND revision = ?',
      ).run(updated.workspace, JSON.stringify(updated), updated.revision, updated.id, expectedRevision)
      if (result.changes === 0) return this.retryRevisionConflict(id, expectedRevision)
    } catch (error) {
      if (isUniqueWorkspaceError(error)) {
        const owner = this.findProjectByWorkspaceSync(workspace)
        throw new ProjectDuplicateWorkspaceError(workspace, owner?.id)
      }
      throw error
    }
    return updated
  }

  /** Crea una ejecución; el proyecto debe existir. */
  async createRun(input: ProjectRunCreateInput): Promise<ProjectRun> {
    await Promise.resolve()
    this.assertOpen()
    this.requireProject(input.projectId)
    const run = validateProjectRun({
      id: randomUUID(), projectId: input.projectId, status: input.status ?? 'queued',
      ...(input.workerId === undefined ? {} : { workerId: input.workerId }),
      ...(input.startedAt === undefined ? {} : { startedAt: input.startedAt }),
    })
    this.database.prepare('INSERT INTO runs (id, project_id, payload) VALUES (?, ?, ?)')
      .run(run.id, run.projectId, JSON.stringify(run))
    return run
  }

  /** Lista las ejecuciones de un proyecto, validando relaciones antes de devolverlas. */
  async listRuns(projectId: ProjectId): Promise<readonly ProjectRun[]> {
    await Promise.resolve()
    this.assertOpen()
    this.requireProject(projectId)
    return this.readSnapshot().runs.filter(run => run.projectId === projectId)
  }

  /** Crea una tarea en estado `todo`. */
  async createTask(input: ProjectTaskCreateInput): Promise<ProjectTask> {
    await Promise.resolve()
    this.assertOpen()
    this.requireProject(input.projectId)
    const now = new Date().toISOString()
    const task = validateProjectTask({
      id: randomUUID(), projectId: input.projectId, title: normalizeRequired(input.title, 'title'),
      status: input.status ?? 'todo', createdAt: now, updatedAt: now,
    })
    this.database.prepare('INSERT INTO tasks (id, project_id, payload) VALUES (?, ?, ?)')
      .run(task.id, task.projectId, JSON.stringify(task))
    return task
  }

  /** Lista las tareas de un proyecto y comprueba que sus referencias sean válidas. */
  async listTasks(projectId: ProjectId): Promise<readonly ProjectTask[]> {
    await Promise.resolve()
    this.assertOpen()
    this.requireProject(projectId)
    return this.readSnapshot().tasks.filter(task => task.projectId === projectId)
  }

  /** Inserta o reemplaza un worker por identidad. */
  async upsertWorker(input: WorkerInput): Promise<Worker> {
    await Promise.resolve()
    this.assertOpen()
    const worker = validateWorker({
      id: input.id ?? brandString<WorkerId>(randomUUID()),
      name: normalizeRequired(input.name, 'name'),
      status: input.status,
      capabilities: [...(input.capabilities ?? [])],
      lastSeenAt: input.lastSeenAt ?? new Date().toISOString(),
    })
    this.database.prepare(
      'INSERT INTO workers (id, payload) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload',
    ).run(worker.id, JSON.stringify(worker))
    return worker
  }

  /** Lee un worker registrado. */
  async getWorker(id: WorkerId): Promise<Worker | undefined> {
    await Promise.resolve()
    this.assertOpen()
    const row = this.database.prepare('SELECT id, payload FROM workers WHERE id = ?').get(id) as RunRow | undefined
    return row === undefined ? undefined : this.decode(row.payload, 'workers', row.id, validateWorker)
  }

  /** Cierra la conexión una sola vez. */
  async close(): Promise<void> {
    await Promise.resolve()
    if (!this.closed) {
      this.closed = true
      this.database.close()
    }
  }

  private readSnapshot(): ProjectStorageSnapshot {
    this.assertOpen()
    const projects = this.readRows('projects', 'SELECT id, workspace, payload FROM projects ORDER BY rowid', validateProjectRecord)
    const runs = this.readRows('runs', 'SELECT id, payload FROM runs ORDER BY rowid', validateProjectRun)
    const tasks = this.readRows('tasks', 'SELECT id, payload FROM tasks ORDER BY rowid', validateProjectTask)
    const workers = this.readRows('workers', 'SELECT id, payload FROM workers ORDER BY rowid', validateWorker)
    try {
      return validateProjectSnapshot({ projects, runs, tasks, workers })
    } catch (error) {
      throw new ProjectCorruptionError('invariants', 'snapshot', { cause: error })
    }
  }

  private readProject(id: ProjectId): ProjectRecord | undefined {
    const row = this.database.prepare('SELECT id, workspace, payload FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
    return row === undefined ? undefined : this.decode(row.payload, 'projects', row.id, validateProjectRecord)
  }

  private findProjectByWorkspaceSync(workspace: string): ProjectRecord | undefined {
    const row = this.database.prepare('SELECT id, workspace, payload FROM projects WHERE workspace = ?').get(workspace) as ProjectRow | undefined
    return row === undefined ? undefined : this.decode(row.payload, 'projects', row.id, validateProjectRecord)
  }

  private requireProject(id: ProjectId): ProjectRecord {
    const project = this.readProject(id)
    if (project === undefined) throw new ProjectNotFoundError(id)
    return project
  }

  private retryRevisionConflict(id: ProjectId, expectedRevision: number): never {
    const current = this.requireProject(id)
    throw new ProjectRevisionConflictError(id, expectedRevision, current)
  }

  private readRows<T>(table: string, query: string, validate: (value: unknown) => T): T[] {
    const rows = this.database.prepare(query).all() as Array<{ id: string; payload: string }>
    return rows.map(row => this.decode(row.payload, table, row.id, validate))
  }

  private decode<T>(payload: string, table: string, key: string, validate: (value: unknown) => T): T {
    try {
      return validate(JSON.parse(payload))
    } catch (error) {
      if (error instanceof ProjectCorruptionError) throw error
      throw new ProjectCorruptionError(table, key, { cause: error })
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new ProjectClosedError()
  }
}

/** Abre el repositorio SQLite sin exponer detalles de `DatabaseSync`. */
export function openProjectRepository(path: string): Promise<SqliteProjectRepository> {
  return SqliteProjectRepository.open(path)
}

async function openDatabase(path: string): Promise<DatabaseSync> {
  const actual = path === ':memory:' ? path : resolve(path)
  if (actual !== ':memory:') {
    await mkdir(dirname(actual), { recursive: true, mode: 0o700 })
    try {
      const handle = await open(actual, 'wx', 0o600)
      await handle.close()
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code !== 'EEXIST') throw error
    }
  }
  return new DatabaseSync(actual)
}

function configureDatabase(database: DatabaseSync, path: string): void {
  database.exec('PRAGMA foreign_keys = ON')
  const version = (database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  if (version !== 0 && version !== SQLITE_SCHEMA_VERSION) {
    throw new Error(`base de Projects '${path}' usa schema ${version}; se esperaba ${SQLITE_SCHEMA_VERSION}`)
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      workspace TEXT NOT NULL UNIQUE,
      payload TEXT NOT NULL,
      revision INTEGER NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      payload TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      payload TEXT NOT NULL
    ) STRICT;
    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL
    ) STRICT;
  `)
  if (version === 0) database.exec(`PRAGMA user_version = ${SQLITE_SCHEMA_VERSION}`)
}

function normalizeRequired(value: string, field: string): string {
  const normalized = value.trim()
  if (normalized.length === 0) throw new TypeError(`${field} no puede estar vacío`)
  return normalized
}

function isUniqueWorkspaceError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed: projects.workspace')
}
