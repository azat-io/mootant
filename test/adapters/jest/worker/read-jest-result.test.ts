import { describe, expect, it } from 'vitest'

import { readJestResult } from '../../../../adapters/jest/worker/read-jest-result'

/**
 * Snapshots of a file that has nothing wrong with them.
 */
let snapshot = { fileDeleted: false, unchecked: 0, unmatched: 0 }

describe('readJestResult', () => {
  it('reads a file that gave a result, with the whole text of Jest', () => {
    let failureMessage = 'first line\nsecond line'

    expect(
      readJestResult({
        testResults: [
          { location: { line: 3 }, ancestorTitles: [], title: 'adds' },
        ],
        failureMessage,
        snapshot,
      }),
    ).toStrictEqual({
      lines: { adds: 3 },
      outcome: 'result',
      execError: null,
      failureMessage,
      message: null,
      snapshots: 0,
      realm: null,
    })
  })

  it('takes execError from the first line of the stack, as the message is empty', () => {
    let testExecError = {
      stack: 'Error: outside any test\n    at file.js:1:1',
      message: '',
    }

    expect(
      readJestResult({ testResults: [], testExecError, snapshot }),
    ).toStrictEqual({
      execError: 'Error: outside any test',
      failureMessage: null,
      outcome: 'result',
      message: null,
      snapshots: 0,
      realm: null,
      lines: {},
    })
  })

  it('calls a file with no tests and no error empty, in the words of Jest', () => {
    expect(
      readJestResult({ failureMessage: null, testResults: [], snapshot }),
    ).toStrictEqual({
      message: 'Your test suite must contain at least one test.',
      failureMessage: null,
      outcome: 'empty',
      execError: null,
      snapshots: 0,
      realm: null,
      lines: {},
    })
  })

  it('joins the names of the blocks and leaves out entries with no location', () => {
    expect(
      readJestResult({
        testResults: [
          {
            ancestorTitles: ['outer', 'inner'],
            location: { line: 7 },
            title: 'works',
          },
          { ancestorTitles: ['outer'], title: 'is skipped', location: null },
          { ancestorTitles: [], title: 'has none' },
        ],
        snapshot,
      }).lines,
    ).toStrictEqual({ 'outer > inner > works': 7 })
  })

  it('counts the snapshots that went unchecked and those that did not match, and a snapshot file with no entry as one', () => {
    expect(
      readJestResult({
        snapshot: { fileDeleted: false, unchecked: 2, unmatched: 3 },
        testResults: [],
      }).snapshots,
    ).toBe(5)
    expect(
      readJestResult({
        snapshot: { fileDeleted: true, unchecked: 0, unmatched: 0 },
        testResults: [],
      }).snapshots,
    ).toBe(1)
  })
})
