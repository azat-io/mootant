import {
  afterEach,
  beforeAll,
  afterAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { realpath, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { devNull, tmpdir } from 'node:os'
import path from 'node:path'

import type { GitRepository } from '../../helpers/create-git-repository'

import { createGitRepository } from '../../helpers/create-git-repository'
import { findGitRoot } from '../../../core/git/find-git-root'

/**
 * Repository of the tests.
 */
let repository: GitRepository

/**
 * Directory outside every repository.
 */
let outside = ''

describe('findGitRoot', () => {
  beforeAll(async () => {
    repository = await createGitRepository()
    outside = await realpath(await mkdtemp(path.join(tmpdir(), 'mootant-no-')))
  })

  afterEach(() => {
    /* Cspell:disable-next-line */
    vi.unstubAllEnvs()
  })

  afterAll(async () => {
    await repository.remove()
    await rm(outside, { recursive: true, force: true })
  })

  it('finds the top of the working tree from a subdirectory', async () => {
    let nested = path.join(repository.root, 'packages/app')
    await mkdir(nested, { recursive: true })

    await expect(findGitRoot(nested)).resolves.toBe(repository.root)
  })

  it('fails outside a repository', async () => {
    await expect(findGitRoot(outside)).rejects.toThrow(
      `--since needs a git repository, and ${outside} is not inside one.`,
    )
  })

  it('passes on why git refuses a repository', async () => {
    vi.stubEnv('GIT_TEST_ASSUME_DIFFERENT_OWNER', '1')
    vi.stubEnv('GIT_CONFIG_GLOBAL', devNull)
    vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')

    await expect(findGitRoot(repository.root)).rejects.toThrow(
      /^--since: git rev-parse failed: fatal: detected dubious ownership/u,
    )
  })
})
