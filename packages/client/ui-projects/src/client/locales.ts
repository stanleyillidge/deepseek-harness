import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** Diccionario del espacio de nombres `projects`. Chino define el conjunto de claves. */
export const zh = {
  'navigation.label': '项目导航',
  'navigation.projects': '项目',
  'header.title': '项目',
  'header.description': '创建项目，集中管理说明并查看运行记录。',
  'action.create': '新建项目',
  'action.open': '打开项目',
  'action.retry': '重试',
  'state.loading': '正在加载项目',
  'state.error.title': '无法加载项目',
  'state.error.description': '项目暂时不可用，请重试。',
  'state.empty.title': '还没有项目',
  'state.empty.description': '创建一个项目来保存说明并跟踪运行。',
  'tabs.overview': '概览',
  'tabs.instructions': '说明',
  'tabs.runs': '运行',
  'project.updated': '最近更新：{date}',
  'project.noDescription': '这个项目还没有描述。',
  'instructions.empty': '这个项目还没有说明。',
  'runs.empty': '还没有运行记录。',
  'runs.count': '{count} 次运行',
  'status.active': '活跃',
  'status.paused': '已暂停',
  'status.archived': '已归档',
  'status.queued': '排队中',
  'status.running': '运行中',
  'status.succeeded': '已完成',
  'status.failed': '失败',
} as const

/** Claves tipadas que puede solicitar el render de Proyectos. */
export type ProjectsKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Copy de navegación y estados de Proyectos. */
    projects: ProjectsKey
  }
}

/** Diccionario inglés completo y alineado con las claves de `zh`. */
export const en = {
  'navigation.label': 'Project navigation',
  'navigation.projects': 'Projects',
  'header.title': 'Projects',
  'header.description': 'Create projects, keep instructions together, and review runs.',
  'action.create': 'New project',
  'action.open': 'Open project',
  'action.retry': 'Retry',
  'state.loading': 'Loading projects',
  'state.error.title': 'Projects could not be loaded',
  'state.error.description': 'Projects are temporarily unavailable. Try again.',
  'state.empty.title': 'No projects yet',
  'state.empty.description': 'Create a project to keep instructions and track runs.',
  'tabs.overview': 'Overview',
  'tabs.instructions': 'Instructions',
  'tabs.runs': 'Runs',
  'project.updated': 'Updated {date}',
  'project.noDescription': 'This project has no description yet.',
  'instructions.empty': 'This project has no instructions yet.',
  'runs.empty': 'No runs yet.',
  'runs.count': '{count} runs',
  'status.active': 'Active',
  'status.paused': 'Paused',
  'status.archived': 'Archived',
  'status.queued': 'Queued',
  'status.running': 'Running',
  'status.succeeded': 'Succeeded',
  'status.failed': 'Failed',
} satisfies Record<ProjectsKey, string>

/** Diccionario español completo y alineado con las claves de `zh`. */
export const es = {
  'navigation.label': 'Navegación de proyectos',
  'navigation.projects': 'Proyectos',
  'header.title': 'Proyectos',
  'header.description': 'Crea proyectos, reúne sus instrucciones y revisa sus ejecuciones.',
  'action.create': 'Nuevo proyecto',
  'action.open': 'Abrir proyecto',
  'action.retry': 'Reintentar',
  'state.loading': 'Cargando proyectos',
  'state.error.title': 'No se pudieron cargar los proyectos',
  'state.error.description': 'Los proyectos no están disponibles temporalmente. Inténtalo de nuevo.',
  'state.empty.title': 'Aún no hay proyectos',
  'state.empty.description': 'Crea un proyecto para guardar instrucciones y seguir sus ejecuciones.',
  'tabs.overview': 'Resumen',
  'tabs.instructions': 'Instrucciones',
  'tabs.runs': 'Ejecuciones',
  'project.updated': 'Actualizado {date}',
  'project.noDescription': 'Este proyecto aún no tiene descripción.',
  'instructions.empty': 'Este proyecto aún no tiene instrucciones.',
  'runs.empty': 'Aún no hay ejecuciones.',
  'runs.count': '{count} ejecuciones',
  'status.active': 'Activo',
  'status.paused': 'Pausado',
  'status.archived': 'Archivado',
  'status.queued': 'En cola',
  'status.running': 'En ejecución',
  'status.succeeded': 'Completada',
  'status.failed': 'Fallida',
} satisfies Record<ProjectsKey, string>
