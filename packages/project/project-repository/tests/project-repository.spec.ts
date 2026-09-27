import { describe, expect, it } from 'vitest'
import {
  ProjectRepository,
  RepositoryCommandError,
  RepositoryPushBlockedError,
  type RepositoryCommand,
  type RepositoryCommandResult,
  type RepositoryExecutor,
} from '@deepseek-ai/dsh-project-repository'

// Visión general del proceso:
// Este ejecutor sintético reemplaza Git por respuestas deterministas y conserva cada orden recibida.
// Así las pruebas verifican la política y los argumentos del repositorio sin crear worktrees reales.
//
// Detalle paso a paso:
// 1. Cada caso configura la salida mínima que necesita la operación.
// 2. El repositorio recibe la ruta y el ejecutor por inyección.
// 3. Las aserciones comprueban el resultado y las órdenes que nunca deben ejecutarse.
class SyntheticRepositoryExecutor implements RepositoryExecutor {
  readonly commands: RepositoryCommand[] = []

  constructor(private readonly respond: (command: RepositoryCommand) => RepositoryCommandResult) {}

  async execute(command: RepositoryCommand): Promise<RepositoryCommandResult> {
    this.commands.push(command)
    return this.respond(command)
  }
}

describe('ProjectRepository', () => {
  it('redacta tokens de URL y diagnósticos antes de exponer un fallo', async () => {
    const token = 'super-secret-token'
    const executor = new SyntheticRepositoryExecutor(() => ({
      exitCode: 1,
      stdout: '',
      stderr: `fatal: https://user:${token}@example.test/repo.git token=${token}`,
    }))
    const repository = new ProjectRepository({
      path: 'C:/work/repo',
      executor,
      policy: { secretValues: [token] },
      remoteUrl: `https://user:${token}@example.test/repo.git`,
    })

    const failure: unknown = await repository.status().catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(RepositoryCommandError)
    if (!(failure instanceof RepositoryCommandError)) throw new Error('se esperaba RepositoryCommandError')
    expect(failure.message).not.toContain(token)
    expect(failure.stderr).toContain('[REDACTED_SECRET]')
    expect(repository.remoteUrl).not.toContain(token)
    expect(executor.commands[0]?.argv).toEqual(['git', 'status', '--porcelain=v1', '--branch'])
  })

  it('clona un repositorio público en el worktree solicitado', async () => {
    const executor = new SyntheticRepositoryExecutor(() => ({ exitCode: 0, stdout: '', stderr: '' }))

    const repository = await ProjectRepository.clone({
      url: 'https://github.com/example/public.git',
      path: 'C:/work/public repo',
      executor,
    })

    expect(repository.path).toBe('C:/work/public repo')
    expect(executor.commands).toEqual([{
      argv: ['git', 'clone', '--no-tags', '--', 'https://github.com/example/public.git', 'C:/work/public repo'],
      cwd: 'C:/work',
    }])
  })

  it('conserva un checkout dirty al inspeccionarlo y crear una rama', async () => {
    const executor = new SyntheticRepositoryExecutor((command) => {
      if (command.argv[1] === 'status') {
        return { exitCode: 0, stdout: '## feature...origin/feature\n M src/file.ts\n?? notes.txt\n', stderr: '' }
      }
      if (command.argv[1] === 'branch') {
        return { exitCode: 0, stdout: '', stderr: '' }
      }
      return { exitCode: 0, stdout: '/work/repo\n', stderr: '' }
    })
    const repository = new ProjectRepository({ path: '/work/repo', executor })

    const status = await repository.status()
    const branch = await repository.createBranch({ name: 'feature/safe-copy' })

    expect(status).toMatchObject({ branch: 'feature', dirty: true })
    expect(status.entries).toEqual([
      { code: ' M', path: 'src/file.ts' },
      { code: '??', path: 'notes.txt' },
    ])
    expect(branch).toEqual({ name: 'feature/safe-copy', protected: false })
    expect(executor.commands.every(command => command.cwd === '/work/repo')).toBe(true)
    expect(executor.commands.some(command => command.argv.includes('clean'))).toBe(false)
    expect(executor.commands.some(command => command.argv.includes('reset'))).toBe(false)
    expect(executor.commands.some(command => command.argv.includes('switch'))).toBe(false)
  })

  it('bloquea push por defecto y no llama al ejecutor', async () => {
    const executor = new SyntheticRepositoryExecutor(() => ({ exitCode: 0, stdout: '', stderr: '' }))
    const repository = new ProjectRepository({
      path: '/work/repo',
      executor,
      policy: { allowPush: false },
    })

    await expect(repository.push()).rejects.toBeInstanceOf(RepositoryPushBlockedError)
    expect(executor.commands).toHaveLength(0)
  })

  it('mantiene bloqueada una rama protegida aunque push tenga opt-in', async () => {
    const executor = new SyntheticRepositoryExecutor((command) => {
      if (command.argv[1] === 'branch') return { exitCode: 0, stdout: 'main\n', stderr: '' }
      return { exitCode: 0, stdout: '', stderr: '' }
    })
    const repository = new ProjectRepository({
      path: '/work/repo',
      executor,
      policy: { allowPush: true },
    })

    await expect(repository.push()).rejects.toThrow("branch 'main' is protected")
    expect(executor.commands).toHaveLength(1)
    expect(executor.commands[0]?.argv).toEqual(['git', 'branch', '--show-current'])
  })
})
