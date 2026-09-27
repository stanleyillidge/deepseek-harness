import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import {
  ProjectCorruptionError,
  ProjectId,
  ProjectRevisionConflictError,
  SqliteProjectRepository,
  assertProjectInvariants,
  openProjectRepository,
} from '../src/index.ts'
import type { ProjectRunId, ProjectStorageSnapshot } from '../src/types.ts'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function databasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-project-'))
  directories.push(directory)
  return join(directory, 'projects.sqlite')
}

describe('SqliteProjectRepository', () => {
  it('crea un proyecto y conserva sus entidades relacionadas', async () => {
    const repository = await openProjectRepository(await databasePath())
    const project = await repository.createProject({ workspace: 'workspace-a', name: 'Proyecto A' })
    const worker = await repository.upsertWorker({ name: 'worker-a', status: 'idle', capabilities: ['typescript'] })
    const run = await repository.createRun({ projectId: project.id, workerId: worker.id })
    const task = await repository.createTask({ projectId: project.id, title: 'Preparar contrato' })

    expect(project.revision).toBe(1)
    expect(await repository.getProject(project.id)).toEqual(project)
    expect(await repository.listRuns(project.id)).toEqual([run])
    expect(await repository.listTasks(project.id)).toEqual([task])
    expect(await repository.getWorker(worker.id)).toEqual(worker)
    await repository.close()
  })

  it('rechaza dos proyectos para el mismo workspace', async () => {
    const repository = await SqliteProjectRepository.open(':memory:')
    await repository.createProject({ workspace: 'workspace-duplicado', name: 'Primero' })

    await expect(repository.createProject({ workspace: ' workspace-duplicado ', name: 'Segundo' }))
      .rejects.toMatchObject({ code: 'duplicate-workspace' })
    await repository.close()
  })

  it('recarga registros y aplica una actualización compare-and-set', async () => {
    const path = await databasePath()
    const first = await openProjectRepository(path)
    const created = await first.createProject({ workspace: 'workspace-reload', name: 'Inicial', description: 'uno' })
    await first.close()

    const second = await openProjectRepository(path)
    try {
      const reloaded = await second.getProject(created.id)
      expect(reloaded).toEqual(created)
      const updated = await second.updateProject(created.id, created.revision, { name: 'Actualizado', description: null })
      expect(updated).toMatchObject({ name: 'Actualizado', revision: 2 })
      expect(updated.description).toBeUndefined()
    } finally {
      await second.close()
    }
  })

  it('rechaza corrupción de payload al volver a abrir', async () => {
    const path = await databasePath()
    const repository = await openProjectRepository(path)
    const project = await repository.createProject({ workspace: 'workspace-corrupto', name: 'Corruptible' })
    await repository.close()

    const database = new DatabaseSync(path)
    database.prepare('UPDATE projects SET payload = ? WHERE id = ?').run('{"revision": "no"}', project.id)
    database.close()

    await expect(openProjectRepository(path)).rejects.toBeInstanceOf(ProjectCorruptionError)
    await expect(openProjectRepository(path)).rejects.toMatchObject({ table: 'projects', key: project.id })
  })

  it('expone la revisión actual cuando una escritura usa una revisión obsoleta', async () => {
    const repository = await SqliteProjectRepository.open(':memory:')
    const project = await repository.createProject({ workspace: 'workspace-revision', name: 'Inicial' })
    const current = await repository.updateProject(project.id, project.revision, { name: 'Primera edición' })

    await expect(repository.updateProject(project.id, project.revision, { name: 'Edición obsoleta' }))
      .rejects.toMatchObject({
        code: 'revision-conflict',
        expectedRevision: 1,
        current,
      } satisfies Partial<ProjectRevisionConflictError>)
    await repository.close()
  })
})

describe('assertProjectInvariants', () => {
  it('rechaza referencias a proyectos o workers inexistentes', () => {
    const snapshot = {
      projects: [],
      runs: [{ id: brandString<ProjectRunId>('run-1'), projectId: ProjectId('missing'), status: 'queued' }],
      tasks: [],
      workers: [],
    } satisfies ProjectStorageSnapshot

    expect(() => { assertProjectInvariants(snapshot) }).toThrow(/proyecto inexistente/)
  })
})
