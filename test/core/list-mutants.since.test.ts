import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { rm } from 'node:fs/promises'
import path from 'node:path'

import type { GitRepository } from '../helpers/create-git-repository'

import { createGitRepository } from '../helpers/create-git-repository'
import { listMutants } from '../../core/list-mutants'

describe('listMutants with --since in a git repository', () => {
  let repository: GitRepository

  beforeEach(async () => {
    repository = await createGitRepository()
    let { write, git } = repository
    await write(
      'app/src/price.ts',
      [
        'export function total(price: number, count: number): number {',
        '  let sum = price * count',
        '  if (count > 10) {',
        '    sum = sum - 5',
        '  }',
        '  return sum',
        '}',
        '',
      ].join('\n'),
    )
    await write('app/src/name.ts', "export let name = 'cart'\n")
    await write('app/src/gone.ts', 'export let gone = 1 + 2\n')
    git('add', '.')
    git('commit', '--quiet', '-m', 'base')
    git('switch', '--quiet', '-c', 'feature')
  })

  afterEach(async () => {
    await repository.remove()
  })

  /**
   * Lists `src` of the app with `--since main` and gives each mutant as its
   * file, line of its start and original text.
   *
   * @returns Files with their mutants, and the revision of the run.
   */
  async function list(): Promise<{
    since: Awaited<ReturnType<typeof listMutants>>['since']
    mutants: string[]
    files: string[]
  }> {
    let result = await listMutants({
      cwd: path.join(repository.root, 'app'),
      paths: ['src'],
      since: 'main',
    })
    return {
      mutants: result.files.flatMap(file =>
        file.mutants.map(mutant => {
          let line = file.source!.slice(0, mutant.start).split('\n').length
          return `${file.file}:${line} ${file.source!.slice(mutant.start, mutant.end)}`
        }),
      ),
      files: result.files.map(file => file.file),
      since: result.since,
    }
  }

  it('lists the mutants on committed, staged and unstaged changes and in untracked files', async () => {
    let { write, root, git } = repository
    let base = git('rev-parse', 'HEAD').trim()
    await write(
      'app/src/price.ts',
      [
        'export function total(price: number, count: number): number {',
        '  let sum = price * count',
        '  if (count >= 10) {',
        '    sum = sum - 5',
        '  }',
        '  return sum',
        '}',
        '',
      ].join('\n'),
    )
    git('commit', '--quiet', '-am', 'feature')
    await rm(path.join(root, 'app/src/gone.ts'))
    await write('app/src/fresh.ts', 'export let fresh = 2 * 3\n')

    let listed = await list()

    expect(listed.since).toStrictEqual({ ref: 'main', base })
    expect(listed.files).toStrictEqual(['src/fresh.ts', 'src/price.ts'])
    expect(listed.mutants).toStrictEqual(
      expect.arrayContaining([
        'src/fresh.ts:1 2 * 3',
        'src/price.ts:3 count >= 10',
      ]),
    )
    expect(listed.mutants.filter(entry => entry.includes(':2 '))).toStrictEqual(
      [],
    )
    expect(listed.mutants.filter(entry => entry.includes(':4 '))).toStrictEqual(
      [],
    )
  })

  it('lists the mutants around a removed line and none without changes', async () => {
    let { write } = repository

    await expect(list()).resolves.toMatchObject({ mutants: [], files: [] })

    await write(
      'app/src/price.ts',
      [
        'export function total(price: number, count: number): number {',
        '  let sum = price * count',
        '  if (count > 10) {',
        '  }',
        '  return sum',
        '}',
        '',
      ].join('\n'),
    )

    let { mutants } = await list()

    expect(mutants).toStrictEqual(
      expect.arrayContaining(['src/price.ts:3 count > 10']),
    )
    expect(mutants.some(entry => entry.startsWith('src/price.ts:5 '))).toBe(
      false,
    )
  })
})
