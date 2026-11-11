import { writeFile, realpath, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { JestTimedRecord } from '../../../adapters/jest/types/jest-timed-record'

import { collectJestDependencies } from '../../../adapters/jest/collect-jest-dependencies'

/**
 * Root of the temporary project of the current test.
 */
let root = ''

/**
 * Builds the records of a unit that ended.
 *
 * @param fields - Fields of `finish` that differ.
 * @returns A `start` and a `finish` record.
 */
function createRecords(
  fields: Partial<Extract<JestTimedRecord, { kind: 'finish' }>> = {},
): JestTimedRecord[] {
  return [
    { kind: 'start', time: 10 },
    {
      failureMessage: null,
      consoleOutput: null,
      outcome: 'result',
      execError: null,
      kind: 'finish',
      transforms: [],
      variables: [],
      message: null,
      tracked: true,
      snapshots: 0,
      outside: [],
      realm: null,
      loaded: [],
      covers: [],
      writes: [],
      dirty: [],
      reads: [],
      lines: {},
      time: 20,
      hits: 0,
      ...fields,
    },
  ]
}

/**
 * Gives the absolute path of a file of the project.
 *
 * @param file - Path relative to the root.
 * @returns The absolute path.
 */
function inRoot(file: string): string {
  return path.join(root, file)
}

describe('collectJestDependencies', () => {
  beforeEach(async () => {
    root = await realpath(await mkdtemp(path.join(tmpdir(), 'mootant-deps-')))
    await mkdir(inRoot('src/lib'), { recursive: true })
    await writeFile(inRoot('package.json'), '{}')
    await writeFile(inRoot('src/lib/package.json'), '{}')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('lists the test file, what the unit read, the package.json files of their directories up to one that exists and the default snapshot file, sorted', () => {
    let file = inRoot('test/sum.test.js')

    expect(
      collectJestDependencies(
        createRecords({
          reads: [inRoot('src/lib/sum.js'), inRoot('src/data.json')],
        }),
        file,
      ),
    ).toStrictEqual([
      inRoot('package.json'),
      inRoot('src/data.json'),
      inRoot('src/lib/package.json'),
      inRoot('src/lib/sum.js'),
      inRoot('src/package.json'),
      inRoot('test/__snapshots__/sum.test.js.snap'),
      inRoot('test/package.json'),
      file,
    ])
  })

  it('lists the modules the worker loaded in its own realm, with the package.json files of their directories', () => {
    let file = inRoot('sum.test.js')

    expect(
      collectJestDependencies(
        createRecords({ loaded: [inRoot('jest/environment.js')] }),
        file,
      ),
    ).toStrictEqual([
      inRoot('__snapshots__/sum.test.js.snap'),
      inRoot('jest/environment.js'),
      inRoot('jest/package.json'),
      inRoot('package.json'),
      file,
    ])
  })

  it('lists each file once', () => {
    let file = inRoot('sum.test.js')

    expect(
      collectJestDependencies(
        createRecords({
          reads: [file, inRoot('package.json'), inRoot('__snapshots__')],
        }),
        file,
      ),
    ).toStrictEqual([
      inRoot('__snapshots__'),
      inRoot('__snapshots__/sum.test.js.snap'),
      inRoot('package.json'),
      file,
    ])
  })

  it('knows nothing of a unit that left no finish', () => {
    expect(
      collectJestDependencies(
        [{ kind: 'start', time: 10 }],
        inRoot('sum.test.js'),
      ),
    ).toBeNull()
  })

  it('knows nothing of a unit whose worker could not see every read', () => {
    expect(
      collectJestDependencies(
        createRecords({ reads: [inRoot('sum.js')], tracked: false }),
        inRoot('sum.test.js'),
      ),
    ).toBeNull()
  })
})
