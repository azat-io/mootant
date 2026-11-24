import type * as FileSystem from 'node:fs/promises'

import {
  writeFile,
  realpath,
  readFile,
  readdir,
  mkdtemp,
  mkdir,
  rm,
} from 'node:fs/promises'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { ProjectTree } from '../../../types/cache/project-tree'
import type { DrySnapshot } from '../../../types/cache/dry-snapshot'

import { hashProjectTree } from '../../../core/cache/hash-project-tree'
import { saveDrySnapshot } from '../../../core/cache/save-dry-snapshot'
import { hashFiles } from '../../../core/cache/hash-files'

vi.mock(import('node:fs/promises'), async importOriginal => {
  let actual = await importOriginal()
  return { ...actual, rename: vi.fn(actual.rename) }
})

vi.mock(
  import('../../../core/cache/hash-project-tree'),
  async importOriginal => {
    let actual = await importOriginal()
    return { hashProjectTree: vi.fn(actual.hashProjectTree) }
  },
)

let { rename } = await import('node:fs/promises')
let actual = await vi.importActual<typeof FileSystem>('node:fs/promises')

/**
 * Real path of the temporary project of a test.
 */
let root = ''

/**
 * Builds a saved dry run of the project as it is now, with the tree it was
 * built from.
 *
 * @param key - Key of the saved dry run.
 * @returns The saved dry run, over `a.test.ts` of the root, and the tree.
 */
async function createSnapshot(
  key = 'key',
): Promise<{ snapshot: DrySnapshot; tree: ProjectTree }> {
  let test = path.join(root, 'a.test.ts')
  let hashes = await hashFiles([test])
  let tree = await hashTree()
  return {
    snapshot: {
      files: [[test, hashes.get(test)!]],
      tree: tree.hash,
      key,
    } as DrySnapshot,
    tree,
  }
}

/**
 * Saves a dry run into the cache directory of the project.
 *
 * @param snapshot - Saved dry run, or null.
 * @param tree - Tree the run hashed before the test runner started, or null.
 * @returns What changed during the run, or null.
 */
function save(
  snapshot: DrySnapshot | null,
  tree: ProjectTree | null,
): Promise<string | null> {
  return saveDrySnapshot({
    file: path.join(root, 'node_modules/.cache/mootant/dry.json'),
    outputs: [path.join(root, 'report.html')],
    snapshot,
    tree,
    root,
  })
}

/**
 * Reads the saved dry run of the project.
 *
 * @returns Its key, or null when nothing is saved.
 */
async function readKey(): Promise<string | null> {
  try {
    let text = await readFile(
      path.join(root, 'node_modules/.cache/mootant/dry.json'),
      'utf8',
    )
    return (JSON.parse(text) as DrySnapshot).key
  } catch {
    return null
  }
}

/**
 * Saves a dry run under the `old` key, as an earlier run would.
 *
 * @returns Resolves once saved.
 */
async function saveOld(): Promise<void> {
  let { snapshot, tree } = await createSnapshot('old')
  await save(snapshot, tree)
}

/**
 * Hashes the tree of the project as it is now, past the report.
 *
 * @returns Its hash with the entry of every path.
 */
async function hashTree(): Promise<ProjectTree> {
  return (await hashProjectTree(root, [path.join(root, 'report.html')]))!
}

describe('saveDrySnapshot', () => {
  beforeEach(async () => {
    vi.mocked(rename).mockReset()
    vi.mocked(rename).mockImplementation(actual.rename)
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'mootant-save-')))
    await writeFile(path.join(root, 'a.test.ts'), 'test')
    await writeFile(path.join(root, 'notes.txt'), 'notes')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('saves a dry run whose files and tree did not change, past the outputs', async () => {
    let { snapshot, tree } = await createSnapshot()
    await writeFile(path.join(root, 'report.html'), 'report')

    await expect(save(snapshot, tree)).resolves.toBeNull()
    await expect(readKey()).resolves.toBe('key')
    await expect(
      readdir(path.join(root, 'node_modules/.cache/mootant')),
    ).resolves.toStrictEqual(['dry.json'])
  })

  it.each<[string, () => Promise<void>, string]>([
    [
      'a file it names changed',
      () => writeFile(path.join(root, 'a.test.ts'), 'x'),
      'a.test.ts changed during the run',
    ],
    [
      'a file was added',
      () => writeFile(path.join(root, 'b.test.ts'), 'test'),
      'b.test.ts was added during the run',
    ],
    [
      'a directory was added',
      async () => {
        await mkdir(path.join(root, 'logs'))
        await writeFile(path.join(root, 'logs/debug.log'), 'x')
      },
      'logs was added during the run',
    ],
    [
      'another file changed',
      () => writeFile(path.join(root, 'notes.txt'), 'x'),
      'notes.txt changed during the run',
    ],
    [
      'a file was removed',
      () => rm(path.join(root, 'notes.txt')),
      'notes.txt was removed during the run',
    ],
  ])(
    'removes the saved one, saves nothing and names the path when %s',
    async (_name, change, named) => {
      await saveOld()
      let { snapshot, tree } = await createSnapshot()
      await change()

      await expect(save(snapshot, tree)).resolves.toBe(named)
      await expect(readKey()).resolves.toBeNull()
    },
  )

  it('removes the saved one and names nothing when the tree can no longer be read', async () => {
    await saveOld()
    let { snapshot, tree } = await createSnapshot()
    vi.mocked(hashProjectTree).mockResolvedValueOnce(null)

    await expect(save(snapshot, tree)).resolves.toBeNull()
    await expect(readKey()).resolves.toBeNull()
  })

  it('removes the saved one for a run that cannot be replayed', async () => {
    let { snapshot, tree } = await createSnapshot()
    await saveOld()

    await expect(save(null, tree)).resolves.toBeNull()
    await expect(readKey()).resolves.toBeNull()

    await saveOld()

    await expect(save(snapshot, null)).resolves.toBeNull()
    await expect(readKey()).resolves.toBeNull()
  })

  it('leaves no file behind and throws nothing when the file cannot be written', async () => {
    await saveOld()
    let { snapshot, tree } = await createSnapshot()
    vi.mocked(rename).mockRejectedValueOnce(new Error('EACCES'))

    await expect(save(snapshot, tree)).resolves.toBeNull()
    await expect(readKey()).resolves.toBeNull()
    await expect(
      readdir(path.join(root, 'node_modules/.cache/mootant')),
    ).resolves.toStrictEqual([])
  })

  it('throws nothing when the saved one cannot be removed', async () => {
    await mkdir(path.join(root, 'node_modules/.cache/mootant/dry.json'), {
      recursive: true,
    })
    await writeFile(
      path.join(root, 'node_modules/.cache/mootant/dry.json/keep'),
      'x',
    )

    await expect(save(null, null)).resolves.toBeNull()
  })
})
