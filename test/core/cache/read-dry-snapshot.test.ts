import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { DrySnapshot } from '../../../types/cache/dry-snapshot'

import { readDrySnapshot } from '../../../core/cache/read-dry-snapshot'
import { CACHE_VERSION } from '../../../core/cache/cache-version'

/**
 * Directory with the files of the tests.
 */
let directory = ''

/**
 * A saved dry run with every part.
 */
let snapshot: DrySnapshot = {
  phase: {
    dry: {
      mismatched: [],
      outside: [],
      served: [],
      files: [],
      tests: [],
      hung: [],
    },
    diagnostics: [],
    errors: [],
  },
  session: {
    inputs: { settings: {}, files: [] },
    diagnostics: [],
    version: null,
    workers: null,
  },
  version: CACHE_VERSION,
  variables: [],
  testFiles: [],
  tree: 'tree',
  key: 'key',
  files: [],
}

/**
 * Writes a file and reads it back as a saved dry run.
 *
 * @param content - Text of the file, or null for no file.
 * @returns The saved dry run, or null.
 */
async function read(content: string | null): Promise<DrySnapshot | null> {
  let file = path.join(directory, 'dry.json')
  await rm(file, { force: true })
  if (content !== null) {
    await writeFile(file, content)
  }
  return readDrySnapshot(file)
}

describe('readDrySnapshot', () => {
  beforeAll(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'mootant-read-dry-'))
  })

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('reads a saved dry run of this version', async () => {
    await expect(read(JSON.stringify(snapshot))).resolves.toStrictEqual(
      snapshot,
    )
  })

  it.each([
    ['a missing file', null],
    ['invalid JSON', '{'],
    ['a value that is not an object', '[]'],
    ['another version', { ...snapshot, version: CACHE_VERSION - 1 }],
    ['no key', { ...snapshot, key: 1 }],
    ['no tree', { ...snapshot, tree: null }],
    ['no files', { ...snapshot, files: {} }],
    ['no variables', { ...snapshot, variables: null }],
    ['no test files', { ...snapshot, testFiles: 'a' }],
    ['no session', { ...snapshot, session: [] }],
    ['no phase', { ...snapshot, phase: null }],
    ['no dry run', { ...snapshot, phase: { ...snapshot.phase, dry: 1 } }],
  ])('gives none for %s', async (_name, content) => {
    await expect(
      read(
        content === null || typeof content === 'string' ?
          content
        : JSON.stringify(content),
      ),
    ).resolves.toBeNull()
  })
})
