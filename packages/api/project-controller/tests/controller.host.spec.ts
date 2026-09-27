// Visión general del proceso:
// Estas pruebas montan un Context real con el registro Typert y un provider de
// proyecto controlado por Vitest para comprobar el contrato del controller.
//
// Detalle paso a paso:
// 1. Se registra el provider mock en `ctx.project`.
// 2. Se verifica que Typert publique los seis endpoints esperados.
// 3. Se comprueba la delegación exacta, la identidad de las respuestas y la propagación de errores.

import { Context } from '@deepseek-ai/cordis'
import type {
  Project,
  ProjectCreateRequest,
  ProjectInstructionsUpdateRequest,
  ProjectOpenRequest,
  ProjectRun,
  ProjectRunRequest,
  ProjectStatus,
  ProjectStatusRequest,
  ProjectSummary,
} from '@deepseek-ai/dsh-project/types'
import type { ProjectService } from '@deepseek-ai/dsh-project'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import { afterEach, expect, it, vi } from 'vitest'
import ProjectController from '../src/index.ts'

const roots: Context[] = []

afterEach(async () => { await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose())) })

const project: Project = {
  id: 'project-1' as Project['id'],
  name: 'Demo',
  path: 'C:/workspace/demo',
  instructions: 'Run the checks',
  updatedAt: 1,
}
const summary: ProjectSummary = project
const run: ProjectRun = { id: 'run-1' as ProjectRun['id'], projectId: project.id, status: 'queued' }
const status: ProjectStatus = { project: summary, activeRun: run }

function fixture() {
  const ctx = new Context()
  roots.push(ctx)
  const provider = {
    list: vi.fn< ProjectService['list'] >().mockResolvedValue([summary]),
    create: vi.fn<ProjectService['create']>().mockResolvedValue(project),
    open: vi.fn<ProjectService['open']>().mockResolvedValue(project),
    updateInstructions: vi.fn<ProjectService['updateInstructions']>().mockResolvedValue(project),
    startRun: vi.fn<ProjectService['startRun']>().mockResolvedValue(run),
    getStatus: vi.fn<ProjectService['getStatus']>().mockResolvedValue(status),
  }
  ctx.provide('project', provider as never)
  return { ctx, provider, controller: new ProjectController(ctx) }
}

it('publica el namespace Remote y delega las operaciones del proyecto', async () => {
  const { controller, provider } = fixture()
  expect(remoteMethods(controller).map(method => method.method)).toEqual([
    'list', 'create', 'open', 'updateInstructions', 'startRun', 'getStatus',
  ])

  const create: ProjectCreateRequest = { name: 'Demo', path: 'C:/workspace/demo', instructions: 'Run the checks' }
  const open: ProjectOpenRequest = { projectId: project.id }
  const update: ProjectInstructionsUpdateRequest = { projectId: project.id, instructions: 'Run only unit tests' }
  const start: ProjectRunRequest = { projectId: project.id, prompt: 'Validate the project' }
  const readStatus: ProjectStatusRequest = { projectId: project.id }

  expect(await controller.list()).toEqual([summary])
  expect(await controller.create(create)).toBe(project)
  expect(await controller.open(open)).toBe(project)
  expect(await controller.updateInstructions(update)).toBe(project)
  expect(await controller.startRun(start)).toBe(run)
  expect(await controller.getStatus(readStatus)).toBe(status)
  expect(provider.create).toHaveBeenCalledExactlyOnceWith(create)
  expect(provider.open).toHaveBeenCalledExactlyOnceWith(open)
  expect(provider.updateInstructions).toHaveBeenCalledExactlyOnceWith(update)
  expect(provider.startRun).toHaveBeenCalledExactlyOnceWith(start)
  expect(provider.getStatus).toHaveBeenCalledExactlyOnceWith(readStatus)
})

it('conserva el valor de lectura y propaga fallos del servicio', async () => {
  const { controller, provider } = fixture()
  const failure = new Error('project store unavailable')
  provider.list.mockRejectedValueOnce(failure)
  await expect(controller.list()).rejects.toBe(failure)
  provider.getStatus.mockRejectedValueOnce(failure)
  await expect(controller.getStatus({ projectId: project.id })).rejects.toBe(failure)
})

it('se integra con un Context sin provider hasta que Cordis lo monta', async () => {
  const ctx = new Context()
  roots.push(ctx)
  ctx.plugin(TypertRegistry)
  const controller = new ProjectController(ctx)
  expect(() => controller.list()).toThrow()
})
