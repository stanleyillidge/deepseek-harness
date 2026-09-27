// Visión general del proceso:
// Este plugin registra una herramienta model-facing para consultar y operar el Project Runtime
// mediante el servicio `ctx.project`. La herramienta solo delega operaciones ya autorizadas por
// el servicio y serializa resultados estables para el modelo.
//
// Detalle paso a paso:
// 1. Se valida la acción mediante el esquema declarativo de la herramienta.
// 2. Se convierte el identificador externo en `ProjectId` antes de delegar.
// 3. Se ejecuta la operación elegida y se devuelve JSON sin incluir secretos ni diagnósticos de host.

import type { Context } from '@deepseek-ai/cordis'
import { ProjectId } from '@deepseek-ai/dsh-project'
import { defineTool } from '@deepseek-ai/dsh-tools'

/** Servicios requeridos por el plugin de herramientas de proyectos. */
export const inject = ['project', 'tools']

/** Nombre del plugin cargado por los bundles que habilitan Project Runtime. */
export const name = 'tool-project'

/** Registra `project`, la herramienta model-facing del runtime. */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'project',
    description: 'List, inspect, configure, start, or check a Project Runtime project. Use exact project_id values returned by list or open. The project service controls persistence, permissions, planning, workers, and recovery.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['list', 'open', 'create', 'update_instructions', 'start_run', 'status'],
        description: 'Operation to perform.',
      },
      project_id: { type: 'string', description: 'Project identifier returned by the project service.' },
      name: { type: 'string', description: 'Visible name for create.' },
      path: { type: 'string', description: 'Local workspace path for create.' },
      instructions: { type: 'string', description: 'Project instructions for create or update_instructions.' },
      prompt: { type: 'string', description: 'Objective to start_run.' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      switch (args.action) {
        case 'list':
          return JSON.stringify(await ctx.project.list())
        case 'create':
          if (args.name === undefined || args.path === undefined) throw new Error('name and path are required for create')
          return JSON.stringify(await ctx.project.create({
            name: args.name,
            path: args.path,
            ...(args.instructions === undefined ? {} : { instructions: args.instructions }),
          }))
        case 'open':
          return JSON.stringify(await ctx.project.open({ projectId: requireProjectId(args.project_id) }))
        case 'update_instructions':
          if (args.instructions === undefined) throw new Error('instructions are required for update_instructions')
          return JSON.stringify(await ctx.project.updateInstructions({
            projectId: requireProjectId(args.project_id),
            instructions: args.instructions,
          }))
        case 'start_run':
          return JSON.stringify(await ctx.project.startRun({
            projectId: requireProjectId(args.project_id),
            ...(args.prompt === undefined ? {} : { prompt: args.prompt }),
          }))
        case 'status':
          return JSON.stringify(await ctx.project.getStatus({ projectId: requireProjectId(args.project_id) }))
        default:
          throw new Error(`unsupported project action: ${String(args.action)}`)
      }
    },
    presentCall: args => ({ card: 'generic', title: `Project: ${args.action}`, kind: 'other', rawInput: args }),
  }))
}

function requireProjectId(value: string | undefined) {
  if (value === undefined || value.trim() === '') throw new Error('project_id is required')
  return ProjectId(value)
}

export default apply
