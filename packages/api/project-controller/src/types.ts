// Visión general del proceso:
// Este módulo mantiene el controller libre de contratos duplicados. Todos los
// valores Remote se importan y reexportan desde el paquete de dominio `project`.
//
// Detalle paso a paso:
// 1. Se importan únicamente declaraciones de tipos del seam de proyectos.
// 2. Se reexportan para que el paquete API tenga una entrada estable para sus consumidores.
// 3. No se añade lógica ni una segunda definición de los payloads.

export type {
  Project,
  ProjectCreateRequest,
  ProjectId,
  ProjectInstructionsUpdateRequest,
  ProjectOpenRequest,
  ProjectRun,
  ProjectRunId,
  ProjectRunRequest,
  ProjectRunStatus,
  ProjectStatus,
  ProjectStatusRequest,
  ProjectSummary,
} from '@deepseek-ai/dsh-project/types'
