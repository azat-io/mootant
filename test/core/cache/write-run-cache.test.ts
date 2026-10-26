import {
  writeFile,
  readFile,
  readdir,
  mkdtemp,
  mkdir,
  rm,
} from 'node:fs/promises'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { RunCacheFile } from '../../../types/cache/run-cache-file'
import type { CacheEntry } from '../../../types/cache/cache-entry'

import { writeRunCache } from '../../../core/cache/write-run-cache'
import { CACHE_VERSION } from '../../../core/cache/cache-version'

/**
 * Directory with the cache files of the tests.
 */
let directory = ''

/**
 * Builds an entry with a key, last used at a time.
 *
 * @param key - Hash the entry is valid for.
 * @param used - Milliseconds since the epoch.
 * @param inputs - Id of the inputs the entry names, or null.
 * @returns Survived evidence with that key, last used then.
 */
function createEntry(
  key: string,
  used: number,
  inputs: string | null = null,
): CacheEntry {
  return {
    status: 'Survived',
    incremental: null,
    path: 'isolated',
    message: null,
    first: false,
    cause: null,
    test: null,
    inputs,
    used,
    key,
  }
}

describe('writeRunCache', () => {
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-write-cache-'))
  })

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('creates the directory and merges the run over the file', async () => {
    let file = path.join(directory, 'nested/run-v1.json')
    await writeRunCache(
      file,
      {
        inputs: new Map([
          ['i1', { files: [['a.json', 'h1']], environment: [] }],
          ['i2', { environment: [['MODE', null]], files: [] }],
        ]),
        entries: new Map([
          ['s1', createEntry('a', 10, 'i1')],
          ['s3', createEntry('d', 10, 'i2')],
        ]),
      },
      10,
    )
    await writeRunCache(
      file,
      {
        entries: new Map([
          ['s2', createEntry('b', 20)],
          ['s1', createEntry('c', 20)],
        ]),
        inputs: new Map(),
      },
      20,
    )

    expect(JSON.parse(await readFile(file, 'utf8'))).toStrictEqual({
      entries: {
        s3: createEntry('d', 10, 'i2'),
        s1: createEntry('c', 20),
        s2: createEntry('b', 20),
      },
      inputs: { i2: { environment: [['MODE', null]], files: [] } },
      version: CACHE_VERSION,
    })
    await expect(readdir(path.dirname(file))).resolves.toStrictEqual([
      'run-v1.json',
    ])
  })

  it('drops old entries', async () => {
    let file = path.join(directory, 'old/run-v1.json')
    await writeRunCache(
      file,
      { entries: new Map([['s1', createEntry('a', 0)]]), inputs: new Map() },
      0,
    )
    await writeRunCache(
      file,
      {
        entries: new Map([['s2', createEntry('b', 40 * 24 * 60 * 60 * 1000)]]),
        inputs: new Map(),
      },
      40 * 24 * 60 * 60 * 1000,
    )

    expect(
      Object.keys(
        (JSON.parse(await readFile(file, 'utf8')) as RunCacheFile).entries,
      ),
    ).toStrictEqual(['s2'])
  })

  it('removes the temporary file when the cache file cannot be replaced', async () => {
    let file = path.join(directory, 'blocked/run-v1.json')
    await mkdir(file, { recursive: true })
    await writeFile(path.join(file, 'inside'), '')

    await expect(
      writeRunCache(
        file,
        { entries: new Map([['s1', createEntry('a', 1)]]), inputs: new Map() },
        1,
      ),
    ).rejects.toThrow()
    await expect(readdir(path.dirname(file))).resolves.toStrictEqual([
      'run-v1.json',
    ])
  })
})
