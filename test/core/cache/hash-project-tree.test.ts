import type * as FileSystem from 'node:fs/promises'

import {
  writeFile,
  realpath,
  mkdtemp,
  symlink,
  mkdir,
  rm,
} from 'node:fs/promises'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { hashProjectTree } from '../../../core/cache/hash-project-tree'
import { hashFiles } from '../../../core/cache/hash-files'

vi.mock(import('node:fs/promises'), async importOriginal => ({
  ...(await importOriginal()),
  readlink: vi.fn(),
  readdir: vi.fn(),
}))

let { readlink, readdir } = await import('node:fs/promises')
let actual = await vi.importActual<typeof FileSystem>('node:fs/promises')

/**
 * Real path of the temporary project of a test.
 */
let root = ''

/**
 * Hashes the temporary project of a test.
 *
 * @param outputs - Absolute paths left out.
 * @returns The hash of its tree, or null when it has none.
 */
async function hashTree(outputs: string[]): Promise<string | null> {
  return (await hashProjectTree(root, outputs))?.hash ?? null
}

describe('hashProjectTree', () => {
  beforeEach(async () => {
    vi.mocked(readdir).mockReset()
    vi.mocked(readdir).mockImplementation(actual.readdir)
    vi.mocked(readlink).mockReset()
    vi.mocked(readlink).mockImplementation(actual.readlink)
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'mootant-tree-')))
    await mkdir(path.join(root, 'src'))
    await writeFile(path.join(root, 'src/a.ts'), 'a')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('changes with any file, directory or link but those of skipped directories and outputs', async () => {
    let report = path.join(root, 'reports/mutation.html')
    let first = await hashTree([report])
    await mkdir(path.join(root, 'node_modules/a'), { recursive: true })
    await mkdir(path.join(root, 'src/node_modules'))
    await mkdir(path.join(root, '.pnpm-store/v10'), { recursive: true })
    await mkdir(path.join(root, '.git'))
    await mkdir(path.join(root, '.mootant'))
    await mkdir(path.join(root, 'reports'))
    await writeFile(path.join(root, 'node_modules/a/index.js'), 'x')
    await writeFile(path.join(root, 'src/node_modules/b.js'), 'x')
    await writeFile(path.join(root, '.pnpm-store/v10/index'), 'x')
    await writeFile(path.join(root, '.git/HEAD'), 'x')
    await writeFile(path.join(root, '.mootant/report.html'), 'x')
    await writeFile(report, 'x')
    let skipped = await hashTree([report])
    await writeFile(report, 'y')

    await expect(hashTree([report])).resolves.toBe(skipped)
    expect(skipped).not.toBe(first)

    let changes: (() => Promise<void>)[] = [
      () => writeFile(path.join(root, 'src/a.ts'), 'b'),
      () => writeFile(path.join(root, 'src/b.ts'), ''),
      async () => {
        await rm(path.join(root, 'src/b.ts'))
        await writeFile(path.join(root, 'src/c.ts'), '')
      },
      () => mkdir(path.join(root, 'src/empty')),
      () => symlink('src', path.join(root, 'link')),
      async () => {
        await rm(path.join(root, 'link'))
        await symlink('reports', path.join(root, 'link'))
      },
    ]
    let hashes = await changes.reduce<Promise<(string | null)[]>>(
      async (previous, change) => {
        let done = await previous
        await change()
        return [...done, await hashTree([report])]
      },
      Promise.resolve([skipped]),
    )

    let unique = new Set(hashes)

    expect(unique.size).toBe(hashes.length)
    await expect(hashTree([])).resolves.not.toBe(await hashTree([report]))
  })

  it('lists what each path is by its path from the root', async () => {
    let file = path.join(root, 'src/a.ts')
    await symlink('src', path.join(root, 'link'))
    let hashes = await hashFiles([file])
    let tree = await hashProjectTree(root, [])

    expect(tree?.entries).toStrictEqual(
      new Map([
        ['src/a.ts', JSON.stringify(['file', hashes.get(file)])],
        ['src', JSON.stringify(['directory', null])],
        ['link', JSON.stringify(['link', 'src'])],
        ['', JSON.stringify(['directory', null])],
      ]),
    )
    expect(tree?.hash).toBe(await hashTree([]))
  })

  it('counts a pipe by its name, and gives no hash when a directory cannot be listed or a link cannot be read', async () => {
    let pipe = path.join(root, 'pipe')
    await mkdir(path.join(root, 'locked'))
    await symlink('src', path.join(root, 'link'))
    /* Cspell:disable-next-line */
    execFileSync('mkfifo', [pipe])
    let first = await hashTree([])

    expect(first).toMatch(/^[\da-f]{64}$/u)
    await expect(hashTree([])).resolves.toBe(first)

    vi.mocked(readdir).mockImplementation(((
      directory: string,
      options: never,
    ) =>
      directory === path.join(root, 'locked') ?
        Promise.reject(new Error('EACCES'))
      : actual.readdir(directory, options)) as never)

    await expect(hashTree([])).resolves.toBeNull()

    vi.mocked(readdir).mockImplementation(actual.readdir)
    vi.mocked(readlink).mockRejectedValue(new Error('EACCES'))

    await expect(hashTree([])).resolves.toBeNull()
  })
})
