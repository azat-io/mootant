import {
  writeFile,
  readFile,
  realpath,
  mkdtemp,
  utimes,
  mkdir,
  rm,
} from 'node:fs/promises'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { RunCacheFile } from '../../../types/cache/run-cache-file'
import type { CachedInputs } from '../../../types/cache/cached-inputs'
import type { CacheEntry } from '../../../types/cache/cache-entry'
import type { RunCache } from '../../../types/cache/run-cache'

import { saveRunCache } from '../../../core/cache/save-run-cache'

/**
 * Real path of the temporary project of the tests.
 */
let root = ''

/**
 * Inputs a reused entry of test file `a` names.
 */
let reused: CachedInputs = { files: [['seed.json', 'h']], environment: [] }

/**
 * Builds a cache with one entry for each of the test files `a` and `b`, the
 * entry of `a` reused with inputs, and one more of `b` whose run read
 * `extra.json`, a missing file and a variable beyond the dry run; the keys took
 * in the content `a.test.ts` has, and other contents of `b.test.ts` and
 * `vitest.config.ts`.
 *
 * @returns Cache over the files of the temporary project.
 */
function createCache(): RunCache {
  let entry: CacheEntry = {
    status: 'Survived',
    path: 'isolated',
    message: null,
    inputs: null,
    cause: null,
    test: null,
    key: 'k',
    used: 1,
  }
  let entries = new Map([
    ['slot-a', { ...entry, inputs: 'r1' }],
    ['slot-b-extra', entry],
    ['slot-b', entry],
  ])
  let pending = new Map([
    [
      'slot-b-extra',
      {
        files: [path.join(root, 'extra.json'), path.join(root, 'missing.json')],
        environment: [['MODE', 'm'] as [string, string]],
      },
    ],
  ])
  return {
    hashes: new Map([
      [
        path.join(root, 'a.test.ts'),
        createHash('sha256').update('a.test.ts').digest('hex'),
      ],
      [path.join(root, 'vitest.config.ts'), 'old'],
      [path.join(root, 'b.test.ts'), 'old'],
    ]),
    forget: file => {
      entries.delete(`slot-${file}`)
      entries.delete(`slot-${file}-extra`)
      pending.delete(`slot-${file}-extra`)
    },
    dependencies: new Map([
      ['a', [path.join(root, 'a.test.ts')]],
      ['b', [path.join(root, 'b.test.ts')]],
    ]),
    environment: [path.join(root, 'vitest.config.ts')],
    inputs: new Map([['r1', reused]]),
    lookupBatch: () => null,
    lookupUnit: () => null,
    recordBatch: () => {},
    recordUnit: () => {},
    entries,
    pending,
  }
}

/**
 * Saves a cache into the cache file of the temporary project.
 *
 * @param started - Start of the run.
 * @param failed - Whether the run had error diagnostics.
 * @returns The warning, and the slots of the saved file or null without one.
 */
async function save(
  started: number,
  failed = false,
): Promise<{
  warning: Awaited<ReturnType<typeof saveRunCache>>
  content?: RunCacheFile
  slots: string[] | null
}> {
  let file = path.join(root, 'cache', 'run-v1.json')
  await rm(file, { force: true })
  let warning = await saveRunCache({
    cache: createCache(),
    started,
    now: 2,
    failed,
    file,
    root,
  })
  let content: RunCacheFile
  try {
    content = JSON.parse(await readFile(file, 'utf8')) as RunCacheFile
  } catch {
    return { slots: null, warning }
  }
  return { slots: Object.keys(content.entries), warning, content }
}

describe('saveRunCache', () => {
  beforeAll(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'mootant-save-')))
    await Promise.all(
      ['a.test.ts', 'b.test.ts', 'extra.json', 'vitest.config.ts'].map(name =>
        writeFile(path.join(root, name), name),
      ),
    )
  })

  afterAll(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('saves every entry when nothing changed during the run', async () => {
    let { content, warning } = await save(Number.POSITIVE_INFINITY)
    let id = content!.entries['slot-b-extra']!.inputs!

    expect(warning).toBeNull()
    expect(Object.keys(content!.entries)).toStrictEqual([
      'slot-a',
      'slot-b-extra',
      'slot-b',
    ])
    expect(content!.entries['slot-a']!.inputs).toBe('r1')
    expect(content!.inputs).toStrictEqual({
      [id]: {
        files: [
          [
            'extra.json',
            'd8afb96a5fc81b9b33418cab098a063ee7ec38b2193684072611d4a6c0a230e4',
          ],
          ['missing.json', null],
        ],
        environment: [['MODE', 'm']],
      },
      r1: reused,
    })
  })

  it('leaves out an entry whose run read a file changed during the run', async () => {
    let future = new Date(Date.now() + 10_000_000)
    await utimes(path.join(root, 'extra.json'), future, future)

    await expect(save(Date.now() + 1)).resolves.toMatchObject({
      slots: ['slot-a', 'slot-b'],
      warning: null,
    })
  })

  it('leaves out the entries of a test file changed during the run', async () => {
    let future = new Date(Date.now() + 10_000_000)
    await utimes(path.join(root, 'b.test.ts'), future, future)

    await expect(save(Date.now() + 1)).resolves.toMatchObject({
      slots: ['slot-a'],
      warning: null,
    })
  })

  it('keeps the entries of a test file whose modified dependency has its hashed content', async () => {
    let future = new Date(Date.now() + 10_000_000)
    await utimes(path.join(root, 'a.test.ts'), future, future)

    await expect(save(Date.now() + 1)).resolves.toMatchObject({
      slots: ['slot-a'],
      warning: null,
    })
  })

  it('saves nothing after errors or a change of the environment', async () => {
    await expect(save(Number.POSITIVE_INFINITY, true)).resolves.toStrictEqual({
      warning: expect.objectContaining({
        message:
          'Verdicts were not cached because the run had errors; the next run will run these mutants again.',
        code: 'cache-skipped',
        severity: 'warning',
      }) as unknown,
      slots: null,
    })
    let future = new Date(Date.now() + 10_000_000)
    await utimes(path.join(root, 'vitest.config.ts'), future, future)
    await expect(save(Date.now() + 1)).resolves.toStrictEqual({
      warning: expect.objectContaining({
        message:
          'Verdicts were not cached because vitest.config.ts changed during the run.',
        code: 'cache-skipped',
      }) as unknown,
      slots: null,
    })
  })

  it('warns when the cache file cannot be written', async () => {
    await mkdir(path.join(root, 'blocked'))
    await writeFile(path.join(root, 'blocked', 'cache'), 'a file')
    let warning = await saveRunCache({
      file: path.join(root, 'blocked', 'cache', 'run-v1.json'),
      started: Number.POSITIVE_INFINITY,
      cache: createCache(),
      failed: false,
      now: 2,
      root,
    })

    expect(warning).toMatchObject({
      message: expect.stringMatching(
        /^The cache could not be saved to blocked\/cache\/run-v1\.json \(.+\); the next run will not reuse the verdicts of this one\.$/u,
      ) as unknown,
      code: 'cache-write-failed',
    })
  })
})
