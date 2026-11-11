import { describe, expect, it } from 'vitest'

import type { JestTimedRecord } from '../../../adapters/jest/types/jest-timed-record'
import type { UnitOutcome } from '../../../adapters/jest/types/unit-outcome'

import { buildDryFile } from '../../../adapters/jest/build-dry-file'
import { getTestId } from '../../../adapters/shared/get-test-id'

/**
 * Where the test file of these tests is.
 */
let input = { file: '/p/a.test.js', project: '', root: '/p' }

/**
 * Builds a `finish` record of a clean result.
 *
 * @param fields - Fields that differ.
 * @returns The record.
 */
function createFinish(
  fields: Partial<Extract<JestTimedRecord, { kind: 'finish' }>> = {},
): JestTimedRecord {
  return {
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
    time: 100,
    hits: 0,
    ...fields,
  }
}

/**
 * Builds a `try` record of a passing attempt.
 *
 * @param fields - Fields that differ.
 * @returns The record.
 */
function createTry(
  fields: Partial<Extract<JestTimedRecord, { kind: 'try' }>> = {},
): JestTimedRecord {
  return {
    timedOut: false,
    reached: false,
    failed: false,
    occurrence: 0,
    message: null,
    covers: null,
    realm: null,
    duration: 0,
    kind: 'try',
    name: 'a',
    time: 50,
    hits: 0,
    ...fields,
  }
}

/**
 * Builds the outcome of a unit that ended.
 *
 * @param records - Records it wrote.
 * @param fields - Fields that differ.
 * @returns What it left behind.
 */
function createOutcome(
  records: JestTimedRecord[],
  fields: Partial<UnitOutcome> = {},
): UnitOutcome {
  return {
    outOfMemory: null,
    signal: null,
    hung: false,
    done: true,
    startup: 0,
    code: null,
    records,
    ...fields,
  }
}

/**
 * What a file reads as when its snapshots alone fail it.
 */
const SNAPSHOTS_LEFT =
  'Snapshots are obsolete or failed while every test passed, which fails a plain run of Jest too.'

describe('buildDryFile', () => {
  it('reads durations, hits, covers and tests of a clean file', () => {
    let id = getTestId('/p', '/p/a.test.js', { occurrence: 0, name: 'a' })

    expect(
      buildDryFile(
        createOutcome([
          { kind: 'start', time: 10 },
          { covers: ['l'], kind: 'load', time: 30, hits: 1 },
          createTry({ covers: ['t'], duration: 20, hits: 2 }),
          createFinish({
            lines: { a: 4 },
            covers: ['l'],
            time: 90,
            hits: 5,
          }),
        ]),
        input,
      ),
    ).toStrictEqual({
      tests: [
        {
          tries: [
            {
              timedOut: false,
              skipped: false,
              reached: false,
              failed: false,
              message: null,
              covers: ['t'],
              mutant: null,
              duration: 20,
              strays: [],
              test: id,
              hits: 2,
            },
          ],
          file: '/p/a.test.js',
          project: '',
          name: 'a',
          line: 4,
          id,
        },
      ],
      entry: {
        dependencies: [
          '/p/__snapshots__/a.test.js.snap',
          '/p/a.test.js',
          '/p/package.json',
          '/package.json',
        ],
        file: '/p/a.test.js',
        concurrent: false,
        loadFailed: false,
        loadDuration: 20,
        hookDuration: 40,
        environment: [],
        covers: ['l'],
        modified: [],
        project: '',
        errors: [],
        hits: 3,
      },
      hung: null,
    })
  })

  it('takes what the file depended on, the variables the code read and the files it read and changed itself from finish', () => {
    let { entry } = buildDryFile(
      createOutcome([
        { kind: 'start', time: 10 },
        createFinish({
          reads: ['/p/data.json', '/p/src/sum.js'],
          variables: ['TZ', 'HOME'],
          writes: ['/p/data.json'],
        }),
      ]),
      input,
    )

    expect(entry).toMatchObject({
      dependencies: [
        '/p/__snapshots__/a.test.js.snap',
        '/p/a.test.js',
        '/p/data.json',
        '/p/package.json',
        '/p/src/package.json',
        '/p/src/sum.js',
        '/package.json',
      ],
      environment: ['TZ', 'HOME'],
      modified: ['/p/data.json'],
    })
  })

  it('gives a test no line when finish does not name it', () => {
    expect(
      buildDryFile(createOutcome([createTry(), createFinish()]), input)
        .tests[0]!.line,
    ).toBeNull()
  })

  it('never reads a duration or hits below zero', () => {
    let { entry } = buildDryFile(
      createOutcome([
        { kind: 'start', time: 10 },
        { kind: 'load', covers: [], time: 30, hits: 1 },
        createTry({ duration: 500, hits: 9 }),
        createFinish({ time: 90, hits: 5 }),
      ]),
      input,
    )

    expect(entry).toMatchObject({ hookDuration: 0, hits: 0 })
  })

  it('counts loading up to the last record when no load record came', () => {
    let { entry } = buildDryFile(
      createOutcome([{ kind: 'start', time: 10 }, createFinish({ time: 60 })]),
      input,
    )

    expect(entry).toMatchObject({ loadDuration: 50, hookDuration: 0 })
  })

  it('gives zeros and no covers to a unit that left no records', () => {
    let { entry, tests } = buildDryFile(
      createOutcome([], { done: false, code: 1 }),
      input,
    )

    expect(tests).toStrictEqual([])
    expect(entry).toStrictEqual({
      errors: [
        'The test process exited with code 1 before the test file ended.',
      ],
      file: '/p/a.test.js',
      dependencies: null,
      concurrent: false,
      loadFailed: true,
      loadDuration: 0,
      hookDuration: 0,
      project: '',
      covers: [],
      hits: 0,
    })
  })

  it('says the records are gone when a worker said it ended and left no finish', () => {
    let { entry } = buildDryFile(
      createOutcome([{ kind: 'start', time: 1 }], { done: false }),
      input,
    )

    expect(entry).toMatchObject({
      errors: ['The test process could not write what its test file did.'],
      loadFailed: true,
    })
  })

  it('keeps covers on a file that failed to load', () => {
    let { entry } = buildDryFile(
      createOutcome([
        { kind: 'start', time: 10 },
        createFinish({
          message: 'Missing fixture data',
          outcome: 'failure',
          realm: 'current',
          covers: ['l'],
        }),
      ]),
      input,
    )

    expect(entry).toMatchObject({
      errors: ['Missing fixture data'],
      loadFailed: true,
      covers: ['l'],
    })
  })

  it('keeps covers on a concurrent file that failed to load', () => {
    let { entry } = buildDryFile(
      createOutcome([
        { kind: 'concurrent', time: 5 },
        createFinish({ outcome: 'failure', message: 'broken', covers: ['l'] }),
      ]),
      input,
    )

    expect(entry).toMatchObject({ concurrent: true, covers: ['l'] })
  })

  it('fails the load of a file with no tests', () => {
    let { entry } = buildDryFile(
      createOutcome([
        createFinish({ message: 'no tests here', outcome: 'empty' }),
      ]),
      input,
    )

    expect(entry).toMatchObject({
      errors: ['no tests here'],
      loadFailed: true,
    })
  })

  it('lists every error of a file in order', () => {
    let { entry } = buildDryFile(
      createOutcome(
        [
          {
            message: 'first hook',
            type: 'afterAll',
            timedOut: false,
            kind: 'hook',
            time: 1,
          },
          {
            message: 'second hook',
            type: 'afterAll',
            timedOut: true,
            kind: 'hook',
            time: 2,
          },
          createFinish({
            execError: 'outside any test',
            message: 'the failure',
            outcome: 'failure',
            snapshots: 1,
          }),
        ],
        { signal: 'SIGKILL', done: false },
      ),
      input,
    )

    expect(entry).toMatchObject({
      errors: [
        'the failure',
        'first hook',
        'second hook',
        'outside any test',
        SNAPSHOTS_LEFT,
        'The test process was stopped by SIGKILL before the test file ended.',
      ],
      loadFailed: true,
    })
  })

  it('fails a file whose snapshots alone fail plain Jest, such as one of a deleted test, with every test passing', () => {
    let { entry } = buildDryFile(
      createOutcome([createTry(), createFinish({ snapshots: 1 })]),
      input,
    )

    expect(entry).toMatchObject({ errors: [SNAPSHOTS_LEFT], loadFailed: true })
  })

  it('leaves snapshots to a failed test, which tells them', () => {
    let { entry } = buildDryFile(
      createOutcome([
        createTry({ message: 'Snapshot mismatched', failed: true }),
        createFinish({ snapshots: 1 }),
      ]),
      input,
    )

    expect(entry).toMatchObject({ loadFailed: false, errors: [] })
  })

  it('leaves a beforeAll that failed to the tests under it, as plain Jest does', () => {
    let { entry, tests } = buildDryFile(
      createOutcome([
        {
          message: 'the hook broke',
          type: 'beforeAll',
          timedOut: false,
          kind: 'hook',
          time: 1,
        },
        createTry({ message: 'the hook broke', realm: 'host', failed: true }),
        createFinish(),
      ]),
      input,
    )

    expect(entry).toMatchObject({ loadFailed: false, errors: [] })
    expect(tests[0]!.tries[0]).toMatchObject({
      message: 'the hook broke',
      failed: true,
    })
  })

  it('reads a file as clean when the tests under a beforeAll that failed pass on retry', () => {
    let { entry, tests } = buildDryFile(
      createOutcome([
        {
          message: 'the hook broke',
          type: 'beforeAll',
          timedOut: false,
          kind: 'hook',
          time: 1,
        },
        createTry({ message: 'the hook broke', realm: 'host', failed: true }),
        createTry(),
        createFinish(),
      ]),
      input,
    )

    expect(entry).toMatchObject({ loadFailed: false, errors: [] })
    expect(tests[0]!.tries[0]).toMatchObject({ failed: false })
  })

  it('fails a file that holds a tracker error, whose try is lost', () => {
    let { entry, tests } = buildDryFile(
      createOutcome([
        { occurrence: 0, kind: 'open', timeout: 5, name: 'a', time: 1 },
        { kind: 'tracker-error', event: 'test_done', message: 'lost', time: 2 },
        createFinish(),
      ]),
      input,
    )

    expect(tests).toStrictEqual([])
    expect(entry).toMatchObject({ errors: ['lost'], loadFailed: true })
  })

  it('splits covers of a concurrent file into load and the run of every try', () => {
    let { entry, tests } = buildDryFile(
      createOutcome([
        { kind: 'concurrent', time: 5 },
        { covers: ['l'], kind: 'load', time: 6, hits: 1 },
        createTry({ name: 'a' }),
        createTry({ name: 'b' }),
        createFinish({ covers: ['l', 'r'] }),
      ]),
      input,
    )

    expect(entry).toMatchObject({ concurrent: true, covers: ['l'] })
    expect(tests.map(test => test.tries[0]!.covers)).toStrictEqual([
      ['r'],
      ['r'],
    ])
  })

  it('gives no covers to a concurrent file that left no finish', () => {
    let { entry, tests } = buildDryFile(
      createOutcome([{ kind: 'concurrent', time: 5 }, createTry()], {
        done: false,
        code: 1,
      }),
      input,
    )

    expect(entry.covers).toStrictEqual([])
    expect(tests[0]!.tries[0]!.covers).toStrictEqual([])
  })

  it('holds the project in test ids and in hung when the project has a name', () => {
    let named = { ...input, project: 'unit' }
    let id = getTestId('/p', '/p/a.test.js', {
      project: 'unit',
      occurrence: 0,
      name: 'a',
    })
    let report = buildDryFile(
      createOutcome(
        [
          { occurrence: 0, kind: 'open', timeout: 5, name: 'a', time: 1 },
          createTry({ name: 'b' }),
        ],
        { signal: 'SIGKILL', done: false, hung: true },
      ),
      named,
    )

    expect(id).not.toBe(
      getTestId('/p', '/p/a.test.js', { occurrence: 0, name: 'a' }),
    )
    expect(report.hung).toStrictEqual({ name: 'a', test: id })
    expect(report.entry.project).toBe('unit')
    expect(report.tests[0]).toMatchObject({
      id: getTestId('/p', '/p/a.test.js', {
        project: 'unit',
        occurrence: 0,
        name: 'b',
      }),
      project: 'unit',
    })
  })

  it('names the last test with no try after its open when the unit hung', () => {
    let { entry, hung } = buildDryFile(
      createOutcome(
        [
          { occurrence: 0, kind: 'open', timeout: 5, name: 'a', time: 1 },
          createTry({ name: 'a' }),
          { occurrence: 0, kind: 'open', timeout: 5, name: 'c', time: 2 },
          { occurrence: 0, kind: 'open', timeout: 5, name: 'b', time: 2 },
          { occurrence: 1, kind: 'open', timeout: 5, name: 'b', time: 3 },
          createTry({ occurrence: 1, name: 'b' }),
        ],
        { signal: 'SIGKILL', done: false, hung: true },
      ),
      input,
    )

    expect(hung).toStrictEqual({
      test: getTestId('/p', '/p/a.test.js', { occurrence: 0, name: 'b' }),
      name: 'b',
    })
    expect(entry.errors).toStrictEqual([
      'The test process ran past its time limit and was stopped.',
    ])
  })

  it('gives a hang outside any test nulls', () => {
    let { hung } = buildDryFile(
      createOutcome([{ kind: 'start', time: 1 }], {
        signal: 'SIGKILL',
        done: false,
        hung: true,
      }),
      input,
    )

    expect(hung).toStrictEqual({ test: null, name: null })
  })
})
