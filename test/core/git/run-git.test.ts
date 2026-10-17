import type { ExecFileException } from 'node:child_process'

import {
  afterEach,
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { execFile } from 'node:child_process'

import type { GitRepository } from '../../helpers/create-git-repository'

import { createGitRepository } from '../../helpers/create-git-repository'
import { runGit } from '../../../core/git/run-git'

vi.mock(import('node:child_process'), async importOriginal => {
  let actual = await importOriginal()
  return { ...actual, execFile: vi.fn(actual.execFile) as never }
})

/**
 * Repository the commands run in.
 */
let repository: GitRepository

describe('runGit', () => {
  beforeAll(async () => {
    repository = await createGitRepository()
  })

  afterEach(() => {
    /* Cspell:disable-next-line */
    vi.unstubAllEnvs()
  })

  afterAll(async () => {
    await repository.remove()
  })

  it('resolves with the output of a command that succeeds or fails', async () => {
    await expect(
      runGit(['rev-parse', '--show-toplevel'], repository.root),
    ).resolves.toStrictEqual({
      stdout: `${repository.root}\n`,
      stderr: '',
      code: 0,
    })
    let failed = await runGit(
      ['rev-parse', '--verify', 'nope'],
      repository.root,
    )
    expect(failed.code).toBe(128)
    expect(failed.stderr).toContain('fatal')
  })

  it('passes the environment on without optional locks, in English', async () => {
    vi.stubEnv('MOOTANT_PROBE', 'yes')
    await runGit(['status'], repository.root)

    expect(vi.mocked(execFile)).toHaveBeenLastCalledWith(
      'git',
      ['-c', 'core.quotePath=false', 'status'],
      expect.objectContaining({
        env: expect.objectContaining({
          GIT_OPTIONAL_LOCKS: '0',
          MOOTANT_PROBE: 'yes',
          LC_ALL: 'C',
        }) as unknown,
        cwd: repository.root,
      }),
      expect.any(Function),
    )
  })

  it('fails when git is missing or cannot run', async () => {
    vi.stubEnv('PATH', '')
    await expect(runGit(['status'], repository.root)).rejects.toThrow(
      '--since needs git, and it was not found.',
    )
    /* Cspell:disable-next-line */
    vi.unstubAllEnvs()
    let error: ExecFileException = Object.assign(
      new Error('stdout maxBuffer length exceeded'),
      { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', cmd: 'git status' },
    )
    vi.mocked(execFile).mockImplementationOnce(((
      _file: string,
      _arguments: string[],
      ...rest: [object, (error: ExecFileException) => void]
    ) => {
      rest[1](error)
    }) as never)
    await expect(runGit(['status'], repository.root)).rejects.toThrow(
      new Error('git could not run: stdout maxBuffer length exceeded', {
        cause: error,
      }),
    )
  })
})
