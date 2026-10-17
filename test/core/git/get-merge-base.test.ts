import { afterEach, describe, expect, it, vi } from 'vitest'
import { devNull } from 'node:os'

import type { GitRepository } from '../../helpers/create-git-repository'

import { createGitRepository } from '../../helpers/create-git-repository'
import { getMergeBase } from '../../../core/git/get-merge-base'

/**
 * Repository of the running test.
 */
let repository: GitRepository | null = null

/**
 * Creates the repository of the running test.
 *
 * @returns The repository, with helpers to write files and run git.
 */
async function createRepository(): Promise<GitRepository> {
  repository = await createGitRepository()
  return repository
}

describe('getMergeBase', () => {
  afterEach(async () => {
    /* Cspell:disable-next-line */
    vi.unstubAllEnvs()
    await repository?.remove()
    repository = null
  })

  it('takes the merge base, not the tip of the revision', async () => {
    let { write, root, git } = await createRepository()
    await write('a.ts', 'let a = 1\n')
    git('add', '.')
    git('commit', '--quiet', '-m', 'base')
    let base = git('rev-parse', 'HEAD').trim()
    git('switch', '--quiet', '-c', 'feature')
    await write('a.ts', 'let a = 2\n')
    git('commit', '--quiet', '-am', 'feature')
    git('switch', '--quiet', 'main')
    await write('b.ts', 'let b = 1\n')
    git('add', '.')
    git('commit', '--quiet', '-m', 'main')
    git('switch', '--quiet', 'feature')

    await expect(getMergeBase('main', root)).resolves.toBe(base)
    await expect(getMergeBase('HEAD', root)).resolves.toBe(
      git('rev-parse', 'HEAD').trim(),
    )
  })

  it('resolves a revision before peeling it to a commit', async () => {
    let { write, root, git } = await createRepository()
    await write('a.ts', 'let a = 1\n')
    git('add', '.')
    git('commit', '--quiet', '-m', 'first message')
    let first = git('rev-parse', 'HEAD').trim()
    git('tag', '-a', '-m', 'tagged', 'v1')
    await write('a.ts', 'let a = 2\n')
    git('commit', '--quiet', '-am', 'second')

    await expect(getMergeBase(':/first', root)).resolves.toBe(first)
    await expect(getMergeBase('v1', root)).resolves.toBe(first)
    await expect(getMergeBase('HEAD:a.ts', root)).rejects.toThrow(
      '--since: git revision "HEAD:a.ts" is not a commit.',
    )
  })

  it('passes on why git fails to read HEAD', async () => {
    let { root } = await createRepository()
    vi.stubEnv('GIT_TEST_ASSUME_DIFFERENT_OWNER', '1')
    vi.stubEnv('GIT_CONFIG_GLOBAL', devNull)
    vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')

    await expect(getMergeBase('main', root)).rejects.toThrow(
      /^--since: git rev-parse failed: fatal: detected dubious ownership/u,
    )
  })

  it('fails without a commit, with an unknown revision and without a common commit', async () => {
    let { write, root, git } = await createRepository()

    await expect(getMergeBase('main', root)).rejects.toThrow(
      '--since needs a commit on HEAD.',
    )

    await write('a.ts', 'let a = 1\n')
    git('add', '.')
    git('commit', '--quiet', '-m', 'base')

    await expect(getMergeBase('nope', root)).rejects.toThrow(
      '--since: unknown git revision "nope".',
    )

    git('switch', '--quiet', '--orphan', 'other')
    await write('b.ts', 'let b = 1\n')
    git('add', '.')
    git('commit', '--quiet', '-m', 'other')

    await expect(getMergeBase('main', root)).rejects.toThrow(
      '--since: main and HEAD have no common commit; a shallow clone may need "git fetch --deepen".',
    )
  })
})
