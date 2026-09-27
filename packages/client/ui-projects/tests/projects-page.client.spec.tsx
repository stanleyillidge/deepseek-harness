// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { en, es, zh, type ProjectsKey } from '../src/client/locales.ts'
import { ProjectsPage, type ProjectsPageProps } from '../src/client/ProjectsPage.tsx'

afterEach(cleanup)

const project = {
  id: 'alpha', name: 'Proyecto Alpha', description: 'Resumen del proyecto', instructions: 'Paso uno\nPaso dos',
  status: 'active' as const, updatedAt: '2026-09-27', runs: [{ id: 'run-1', status: 'succeeded' as const, startedAt: '2026-09-27 10:00' }],
}

function translate(dictionary: Record<ProjectsKey, string>): ProjectsPageProps['t'] {
  return ((key: ProjectsKey, params?: Record<string, unknown>) => {
    const template = dictionary[key] ?? en[key]
    return params === undefined
      ? template
      : template.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match)
  }) as ProjectsPageProps['t']
}

function renderPage(locale: 'zh' | 'en' | 'es', state: ProjectsPageProps['state'] = { status: 'ready', projects: [project], selectedProjectId: project.id }) {
  const dictionaries = { zh, en, es }
  const t = translate(dictionaries[locale])
  return render(<ProjectsPage state={state} onCreateProject={vi.fn()} onOpenProject={vi.fn()} onRetry={vi.fn()} t={t} />)
}

describe('ProjectsPage', () => {
  it('renderiza navegación, apertura, instrucciones y ejecuciones en español', () => {
    const onOpenProject = vi.fn()
    const t = translate(es)
    render(<ProjectsPage state={{ status: 'ready', projects: [project], selectedProjectId: project.id }} onCreateProject={vi.fn()} onOpenProject={onOpenProject} onRetry={vi.fn()} t={t} />)

    expect(screen.getByRole('navigation', { name: 'Navegación de proyectos' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Abrir proyecto' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Instrucciones' }))
    expect(screen.getByText(/Paso uno/)).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Ejecuciones' }))
    expect(screen.getByText('Completada')).toBeTruthy()
    fireEvent.click(screen.getByRole('complementary').querySelector('button')!)
    expect(onOpenProject).toHaveBeenCalledWith('alpha')
  })

  it('mantiene los estados de carga, error y vacío con copy localizado', () => {
    const loading = renderPage('en', { status: 'loading' })
    expect(screen.getByRole('status', { name: 'Loading projects' })).toBeTruthy()
    loading.unmount()

    renderPage('zh', { status: 'error' })
    expect(screen.getByRole('alert').textContent).toContain('无法加载项目')
    cleanup()

    renderPage('es', { status: 'ready', projects: [] })
    expect(screen.getByText('Aún no hay proyectos')).toBeTruthy()
  })
})
