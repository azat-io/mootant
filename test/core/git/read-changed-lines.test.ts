import { afterEach, describe, expect, it, vi } from 'vitest'
import { symlink, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

import type { GitRepository } from '../../helpers/create-git-repository'

import { createGitRepository } from '../../helpers/create-git-repository'
import { readChangedLines } from '../../../core/git/read-changed-lines'
import { runGit } from '../../../core/git/run-git'

vi.mock(import('../../../core/git/run-git'), async importOriginal => {
  let actual = await importOriginal()
  return { runGit: vi.fn(actual.runGit) }
})

/**
 * Repository of the running test.
 */
let repository: GitRepository | null = null

/**
 * Reads the changed lines with sorted line lists.
 *
 * @param directory - Directory inside the repository.
 * @param revision - Revision to compare with, such as `main`.
 * @returns Base and sorted lines by path relative to the repository.
 */
async function read(
  directory: string,
  revision: string,
): Promise<{ files: Record<string, number[] | 'all'>; base: string }> {
  let { files, base } = await readChangedLines(directory, revision)
  return {
    files: Object.fromEntries(
      [...files].map(([file, lines]) => [
        path.relative(repository!.root, file),
        lines === 'all' ? 'all' : [...lines].toSorted((a, b) => a - b),
      ]),
    ),
    base,
  }
}

/**
 * Lines of a numbered file: `line 1` to `line <count>`.
 *
 * @param count - Number of lines.
 * @param changes - Replaced lines by number.
 * @returns Text with a final line break.
 */
function createLines(
  count: number,
  changes: Record<number, string> = {},
): string {
  return Array.from(
    { length: count },
    (_value, index) => `${changes[index + 1] ?? `line ${index + 1}`}\n`,
  ).join('')
}

describe('readChangedLines', () => {
  afterEach(async () => {
    await repository?.remove()
    repository = null
  })

  it('reads committed, staged, unstaged and untracked changes against the merge base', async () => {
    repository = await createGitRepository()
    let { write, root, git } = repository
    await write('.gitignore', 'dist\n')
    await write('src/committed.ts', createLines(5))
    await write('src/staged.ts', createLines(5))
    await write('src/unstaged.ts', createLines(5))
    await write('src/deleted.ts', createLines(5))
    await write('src/old name.ts', createLines(20))
    await write('src/same.ts', createLines(3))
    await write('src/binary.ts', 'let a = 1 // \0\n')
    await write('src/vendor.js', createLines(3))
    await write('.gitattributes', 'src/vendor.js -diff\n')
    git('add', '.')
    git('commit', '--quiet', '-m', 'base')
    let base = git('rev-parse', 'HEAD').trim()
    git('switch', '--quiet', '-c', 'feature')
    await write('src/committed.ts', createLines(5, { 2: 'changed' }))
    git('commit', '--quiet', '-am', 'feature')
    git('switch', '--quiet', 'main')
    await write('src/same.ts', createLines(3, { 1: 'on main' }))
    git('commit', '--quiet', '-am', 'main')
    git('switch', '--quiet', 'feature')
    await write('src/staged.ts', createLines(4, { 4: 'line 5' }))
    git('add', 'src/staged.ts')
    await write('src/unstaged.ts', createLines(5, { 1: 'first', 5: 'last' }))
    await rm(path.join(root, 'src/deleted.ts'))
    git('mv', 'src/old name.ts', 'src/new name.ts')
    await write('src/new name.ts', createLines(20, { 19: 'renamed' }))
    await write('src/binary.ts', 'let a = 2 // \0\n')
    await write('src/vendor.js', createLines(3, { 2: 'vendored' }))
    await write('src/untracked.ts', 'let a = 1\n')
    await write('dist/ignored.js', 'let a = 1\n')
    /* Cspell:disable-next-line */
    git('config', 'diff.noprefix', 'true')
    git('config', 'diff.relative', 'true')
    git('config', 'diff.interHunkContext', '10')
    git('config', 'color.ui', 'always')
    git('config', 'diff.renames', 'false')
    await mkdir(path.join(root, 'packages/app'), { recursive: true })

    await expect(
      read(path.join(root, 'packages/app'), 'main'),
    ).resolves.toStrictEqual({
      files: {
        'src/unstaged.ts': [1, 5],
        'src/untracked.ts': 'all',
        'src/new name.ts': [19],
        'src/committed.ts': [2],
        'src/staged.ts': [3, 4],
        'src/binary.ts': 'all',
        'src/vendor.js': 'all',
      },
      base,
    })
  })

  it('resolves paths through linked directories, and keeps broken links as they are', async () => {
    repository = await createGitRepository()
    let { write, root, git } = repository
    await write('real/a.ts', 'let a = 1\n')
    await symlink('real', path.join(root, 'linked'))
    git('add', '.')
    git('commit', '--quiet', '-m', 'base')
    await write('real/a.ts', 'let a = 2\n')
    await symlink('missing.ts', path.join(root, 'broken.ts'))

    await expect(read(root, 'HEAD')).resolves.toStrictEqual({
      files: { 'broken.ts': 'all', 'real/a.ts': [1] },
      base: git('rev-parse', 'HEAD').trim(),
    })
  })

  it('fails with what git printed when a command fails', async () => {
    repository = await createGitRepository()
    let { write, root, git } = repository
    await write('a.ts', 'let a = 1\n')
    git('add', '.')
    git('commit', '--quiet', '-m', 'base')
    let actual = vi.mocked(runGit).getMockImplementation()!
    vi.mocked(runGit).mockImplementation((gitArguments, cwd) =>
      gitArguments[0] === 'ls-files' ?
        Promise.resolve({
          stderr: 'fatal: broken index\n',
          stdout: '',
          code: 128,
        })
      : actual(gitArguments, cwd),
    )

    await expect(readChangedLines(root, 'HEAD')).rejects.toThrow(
      '--since: git ls-files failed: fatal: broken index',
    )
    vi.mocked(runGit).mockImplementation(actual)
  })
})
