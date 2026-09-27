import { useState, type ReactNode } from 'react'
import { Button, IconCodeOutlineRegular, IconFolderOpenOutlineRegular, IconPlayOutlineRegular, IconProjectAddOutlineRegular, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ProjectsPage.module.css'

/** Identificador opaco de un proyecto, conservado por la capa que posee los datos. */
export type ProjectId = string

/** Estado del proyecto que se muestra en una lista de ejecuciones. */
export type ProjectStatus = 'active' | 'paused' | 'archived'

/** Estado visible de una ejecución. */
export type ProjectRunStatus = 'queued' | 'running' | 'succeeded' | 'failed'

/** Ejecución proyectada por el propietario de los datos. */
export interface ProjectRun {
  readonly id: string
  readonly status: ProjectRunStatus
  readonly startedAt: string
}

/** Proyecto mínimo que necesita la primera superficie de Proyectos. */
export interface Project {
  readonly id: ProjectId
  readonly name: string
  readonly description?: string
  readonly instructions?: string
  readonly status: ProjectStatus
  readonly updatedAt: string
  readonly runs: readonly ProjectRun[]
}

/** Carga de la consulta que alimenta la página. */
export type ProjectsPageState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly projects: readonly Project[]; readonly selectedProjectId?: ProjectId }

/** Pestañas de detalle disponibles para un proyecto seleccionado. */
export type ProjectTab = 'overview' | 'instructions' | 'runs'

/** Props de la página completa, con copy entregado por el runtime de locale. */
export type ProjectsPageProps = PropsLocale<'projects'> & {
  readonly state: ProjectsPageState
  readonly onCreateProject: () => void
  readonly onOpenProject: (projectId: ProjectId) => void
  readonly onRetry: () => void
}

type ProjectT = ProjectsPageProps['t']

/**
 * Renderiza la navegación inicial y el detalle de Proyectos.
 * @param props - estado, acciones y traductor proporcionados por la composición host.
 * @returns la superficie de Proyectos con el estado solicitado.
 */
export function ProjectsPage({ state, onCreateProject, onOpenProject, onRetry, t }: ProjectsPageProps) {
  const [tab, setTab] = useState<ProjectTab>('overview')

  return (
    <section className={css.page} aria-labelledby="projects-page-title">
      <nav className={css.navigation} aria-label={t('navigation.label')}>
        <button className={css.navigationItem} type="button" aria-current="page">
          <IconFolderOpenOutlineRegular size={16} />
          {t('navigation.projects')}
        </button>
      </nav>
      <header className={css.header}>
        <div>
          <h1 id="projects-page-title">{t('header.title')}</h1>
          <p>{t('header.description')}</p>
        </div>
        <Button variant="primary" icon={<IconProjectAddOutlineRegular size={16} />} onClick={onCreateProject}>
          {t('action.create')}
        </Button>
      </header>
      {state.status === 'loading' && <LoadingState t={t} />}
      {state.status === 'error' && <ErrorState onRetry={onRetry} t={t} />}
      {state.status === 'ready' && state.projects.length === 0 && <EmptyState onCreateProject={onCreateProject} t={t} />}
      {state.status === 'ready' && state.projects.length > 0 && (
        <ReadyState state={state} tab={tab} setTab={setTab} onOpenProject={onOpenProject} t={t} />
      )}
    </section>
  )
}

function LoadingState({ t }: { t: ProjectT }) {
  return (
    <div className={css.centerState} role="status" aria-label={t('state.loading')}>
      <span className={css.spinner} aria-hidden="true" />
    </div>
  )
}

function ErrorState({ onRetry, t }: { onRetry: () => void; t: ProjectT }) {
  return (
    <div className={css.centerState} role="alert">
      <div className={css.stateIcon}><IconFolderOpenOutlineRegular size={24} /></div>
      <h2>{t('state.error.title')}</h2>
      <p>{t('state.error.description')}</p>
      <Button variant="outline" icon={<IconFolderOpenOutlineRegular size={16} />} onClick={onRetry}>
        {t('action.retry')}
      </Button>
    </div>
  )
}

function EmptyState({ onCreateProject, t }: { onCreateProject: () => void; t: ProjectT }) {
  return (
    <div className={css.centerState}>
      <div className={css.stateIcon}><IconProjectAddOutlineRegular size={24} /></div>
      <h2>{t('state.empty.title')}</h2>
      <p>{t('state.empty.description')}</p>
      <Button variant="primary" icon={<IconProjectAddOutlineRegular size={16} />} onClick={onCreateProject}>
        {t('action.create')}
      </Button>
    </div>
  )
}

function ReadyState({ state, tab, setTab, onOpenProject, t }: {
  state: Extract<ProjectsPageState, { status: 'ready' }>
  tab: ProjectTab
  setTab: (tab: ProjectTab) => void
  onOpenProject: (projectId: ProjectId) => void
  t: ProjectT
}) {
  const first = state.projects[0]
  if (first === undefined) return null
  const selected = state.projects.find(project => project.id === state.selectedProjectId) ?? first
  return (
    <div className={css.content}>
      <aside className={css.list} aria-label={t('header.title')}>
        {state.projects.map(project => (
          <button
            className={css.projectRow}
            type="button"
            key={project.id}
            aria-current={project.id === selected.id ? 'true' : undefined}
            onClick={() => { onOpenProject(project.id) }}
          >
            <span className={css.projectRowIcon}><IconFolderOpenOutlineRegular size={16} /></span>
            <span className={css.projectRowDetails}>
              <span className={css.projectRowName}>{project.name}</span>
              <span className={css.projectRowMeta}>{t('runs.count', { count: project.runs.length })}</span>
            </span>
            <Tag tone={project.status === 'active' ? 'success' : project.status === 'paused' ? 'warning' : 'quiet'}>
              {t(`status.${project.status}`)}
            </Tag>
          </button>
        ))}
      </aside>
      <article className={css.detail} aria-labelledby="selected-project-title">
        <div className={css.detailHeader}>
          <div>
            <p className={css.eyebrow}>{t('navigation.projects')}</p>
            <h2 id="selected-project-title">{selected.name}</h2>
            <p className={css.updated}>{t('project.updated', { date: selected.updatedAt })}</p>
          </div>
          <Button variant="outline" icon={<IconFolderOpenOutlineRegular size={16} />} onClick={() => { onOpenProject(selected.id) }}>
            {t('action.open')}
          </Button>
        </div>
        <div className={css.tabs} role="tablist" aria-label={selected.name}>
          <TabButton tab="overview" active={tab === 'overview'} onSelect={setTab} icon={<IconFolderOpenOutlineRegular size={16} />} t={t} />
          <TabButton tab="instructions" active={tab === 'instructions'} onSelect={setTab} icon={<IconCodeOutlineRegular size={16} />} t={t} />
          <TabButton tab="runs" active={tab === 'runs'} onSelect={setTab} icon={<IconPlayOutlineRegular size={16} />} t={t} />
        </div>
        <ProjectTabContent project={selected} tab={tab} t={t} />
      </article>
    </div>
  )
}

function TabButton({ tab, active, onSelect, icon, t }: {
  tab: ProjectTab
  active: boolean
  onSelect: (tab: ProjectTab) => void
  icon: ReactNode
  t: ProjectT
}) {
  return (
    <button className={css.tab} type="button" role="tab" aria-selected={active} onClick={() => { onSelect(tab) }}>
      {icon}
      {t(`tabs.${tab}`)}
    </button>
  )
}

function ProjectTabContent({ project, tab, t }: { project: Project; tab: ProjectTab; t: ProjectT }) {
  if (tab === 'instructions') {
    return <section className={css.tabContent} role="tabpanel"><h3>{t('tabs.instructions')}</h3><p className={css.instructions}>{project.instructions ?? t('instructions.empty')}</p></section>
  }
  if (tab === 'runs') {
    return (
      <section className={css.tabContent} role="tabpanel">
        <h3>{t('tabs.runs')}</h3>
        {project.runs.length === 0 ? <p className={css.muted}>{t('runs.empty')}</p> : (
          <ul className={css.runs}>
            {project.runs.map(run => <li className={css.run} key={run.id}><span>{run.startedAt}</span><Tag tone={run.status === 'succeeded' ? 'success' : run.status === 'failed' ? 'danger' : run.status === 'running' ? 'info' : 'quiet'}>{t(`status.${run.status}`)}</Tag></li>)}
          </ul>
        )}
      </section>
    )
  }
  return (
    <section className={css.tabContent} role="tabpanel">
      <h3>{t('tabs.overview')}</h3>
      <p>{project.description ?? t('project.noDescription')}</p>
      <div className={css.overviewMeta}><Tag tone="neutral">{t(`status.${project.status}`)}</Tag><span>{t('runs.count', { count: project.runs.length })}</span></div>
    </section>
  )
}
