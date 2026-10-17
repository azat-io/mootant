import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { StoredCache } from '../../../types/cache/stored-cache'
import type { CacheEntry } from '../../../types/cache/cache-entry'

import { readRunCache } from '../../../core/cache/read-run-cache'

/**
 * Directory with the cache files of the tests.
 */
let directory = ''

/**
 * Valid entry of a kill.
 */
let kill: CacheEntry = {
  message: 'expected 1 to be 2',
  cause: 'assertion',
  status: 'Killed',
  path: 'isolated',
  inputs: null,
  test: 't1',
  key: 'k1',
  used: 1,
}

/**
 * Writes a cache file and reads it back.
 *
 * @param content - Text of the file.
 * @returns Entries and inputs read.
 */
async function read(content: string): Promise<StoredCache> {
  let file = path.join(directory, 'run-v1.json')
  await writeFile(file, content)
  return readRunCache(file)
}

describe('readRunCache', () => {
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-read-cache-'))
  })

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('reads the valid entries and inputs and drops malformed ones', async () => {
    let survived: CacheEntry = {
      status: 'Survived',
      path: 'isolated',
      message: null,
      inputs: 'i1',
      cause: null,
      test: null,
      key: 'k2',
      used: 2,
    }
    let inputs = {
      environment: [
        ['MODE', 'h1'],
        ['UNSET', null],
      ],
      files: [['lib/lazy.js', 'l1']],
    }
    let stored = await read(
      JSON.stringify({
        entries: {
          s3: { ...kill, status: 'Timeout' },
          s10: { ...kill, inputs: 'i2' },
          s4: { ...kill, path: 'dry' },
          s11: { ...kill, inputs: 1 },
          s6: { ...kill, message: 1 },
          s8: { ...kill, used: '1' },
          s5: { ...kill, cause: 1 },
          s7: { ...kill, test: 1 },
          s9: { ...kill, key: 1 },
          s2: survived,
          s1: kill,
          s0: null,
        },
        inputs: {
          i5: { files: [['a', 1]], environment: [] },
          i4: { environment: [], files: [['a']] },
          i6: { environment: [1], files: [] },
          i3: { environment: [], files: {} },
          i2: { files: [] },
          i1: inputs,
          i0: null,
        },
        version: 1,
      }),
    )

    expect([...stored.inputs]).toStrictEqual([['i1', inputs]])
    expect([...stored.entries]).toStrictEqual([
      ['s2', survived],
      ['s1', kill],
    ])
  })

  it.each([
    ['a missing file', null],
    ['invalid JSON', '{'],
    [
      'another version',
      JSON.stringify({ entries: { s1: kill }, inputs: {}, version: 2 }),
    ],
    ['a file without entries', JSON.stringify({ inputs: {}, version: 1 })],
    [
      'a file without inputs',
      JSON.stringify({ entries: { s1: kill }, version: 1 }),
    ],
    ['a file that is not an object', '[]'],
  ])('reads nothing from %s', async (_name, content) => {
    let stored =
      content === null ?
        await readRunCache(path.join(directory, 'missing.json'))
      : await read(content)

    expect(stored.entries.size).toBe(0)
    expect(stored.inputs.size).toBe(0)
  })
})
