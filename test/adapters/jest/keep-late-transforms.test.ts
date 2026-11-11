import { describe, expect, it } from 'vitest'

import type { JestTimedRecord } from '../../../adapters/jest/types/jest-timed-record'

import { keepLateTransforms } from '../../../adapters/jest/keep-late-transforms'

/**
 * Builds the records of a unit that ended.
 *
 * @param transforms - What its transformers read.
 * @returns The records, `finish` last.
 */
function createRecords(transforms: string[]): JestTimedRecord[] {
  return [
    { kind: 'start', time: 10 },
    {
      failureMessage: null,
      consoleOutput: null,
      outcome: 'result',
      execError: null,
      kind: 'finish',
      variables: [],
      message: null,
      tracked: true,
      snapshots: 0,
      outside: [],
      realm: null,
      loaded: [],
      covers: [],
      writes: [],
      transforms,
      dirty: [],
      reads: [],
      lines: {},
      time: 50,
      hits: 0,
    },
  ]
}

describe('keepLateTransforms', () => {
  it('keeps what the transformers read that no dry run did, each once, and leaves the dry runs alone', () => {
    let state = {
      transforms: new Set(['/p/babel.config.js']),
      lateTransforms: new Set(['/p/a/.babelrc']),
    }
    keepLateTransforms(
      state,
      createRecords(['/p/babel.config.js', '/p/b/.babelrc', '/p/a/.babelrc']),
    )

    expect(state.lateTransforms).toStrictEqual(
      new Set(['/p/a/.babelrc', '/p/b/.babelrc']),
    )
    expect(state.transforms).toStrictEqual(new Set(['/p/babel.config.js']))
  })

  it('adds nothing for a unit with no finish, which says nothing of what it read', () => {
    let state = {
      lateTransforms: new Set<string>(),
      transforms: new Set<string>(),
    }
    keepLateTransforms(state, [{ kind: 'start', time: 10 }])

    expect(state.lateTransforms).toStrictEqual(new Set())
  })

  it('keeps a missing file the transformers looked for, whatever its name, as creating it runs the unit again', () => {
    let state = {
      lateTransforms: new Set<string>(),
      transforms: new Set<string>(),
    }
    keepLateTransforms(
      state,
      createRecords([import.meta.filename, '/p/src.ts', '/p/src/.babelrc']),
    )

    expect(state.lateTransforms).toStrictEqual(
      new Set([import.meta.filename, '/p/src/.babelrc', '/p/src.ts']),
    )
  })
})
