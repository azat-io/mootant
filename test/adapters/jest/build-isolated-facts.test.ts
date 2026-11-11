import { describe, expect, it } from 'vitest'

import type { JestTimedRecord } from '../../../adapters/jest/types/jest-timed-record'
import type { UnitOutcome } from '../../../adapters/jest/types/unit-outcome'

import { buildIsolatedFacts } from '../../../adapters/jest/build-isolated-facts'
import { getTestId } from '../../../adapters/shared/get-test-id'

/**
 * The record of a unit that started.
 */
let start: JestTimedRecord = { kind: 'start', time: 10 }

/**
 * The record of a file that loaded.
 */
let load: JestTimedRecord = { kind: 'load', covers: [], time: 20, hits: 2 }

/**
 * The record of a reach.
 */
let reach: JestTimedRecord = { kind: 'reached', time: 30, hits: 3 }

/**
 * The unit of these tests.
 */
let input = {
  limits: { hitLimit: 100, timeout: 500 },
  file: '/p/a.test.js',
  retrying: false,
  clean: false,
  project: '',
  mutant: 'm',
  root: '/p',
  unit: 4,
}

/**
 * The unit of these tests, as a clean attempt.
 */
let clean = { ...input, clean: true }

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
    time: 90,
    hits: 5,
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
    duration: 7,
    kind: 'try',
    name: 'a',
    time: 40,
    hits: 1,
    ...fields,
  }
}

/**
 * Builds what a unit that ended left behind.
 *
 * @param records - Its records.
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
    startup: 12,
    hung: false,
    done: true,
    code: null,
    records,
    ...fields,
  }
}

/**
 * Builds a `hook` record.
 *
 * @param fields - Fields that differ.
 * @returns The record.
 */
function createHook(
  fields: Partial<Extract<JestTimedRecord, { kind: 'hook' }>> = {},
): JestTimedRecord {
  return {
    message: 'the hook broke',
    type: 'beforeAll',
    timedOut: false,
    kind: 'hook',
    time: 25,
    ...fields,
  }
}

/**
 * Builds a `try` record of a failing attempt.
 *
 * @param fields - Fields that differ.
 * @returns The record.
 */
function createFailed(
  fields: Partial<Extract<JestTimedRecord, { kind: 'try' }>> = {},
): JestTimedRecord {
  return createTry({
    realm: 'current',
    message: 'boom',
    failed: true,
    ...fields,
  })
}

/**
 * Builds what a worker the watchdog stopped in a unit left behind.
 *
 * @param records - Its records.
 * @returns What it left behind.
 */
function createHang(records: JestTimedRecord[]): UnitOutcome {
  return createOutcome(records, {
    signal: 'SIGKILL',
    done: false,
    hung: true,
  })
}

/**
 * Builds what a worker that exited in a unit left behind.
 *
 * @param records - Its records.
 * @returns What it left behind.
 */
function createExit(records: JestTimedRecord[]): UnitOutcome {
  return createOutcome(records, { done: false, code: 1 })
}

describe('buildIsolatedFacts', () => {
  describe('with no reach', () => {
    it.each<[string, UnitOutcome]>([
      [
        'a test that failed',
        createOutcome([start, load, createFailed(), createFinish()]),
      ],
      [
        'a test that ran past its timeout',
        createOutcome([
          start,
          load,
          createFailed({
            message: 'Exceeded timeout of 5 ms for a test.',
            realm: 'primitive',
            timedOut: true,
          }),
          createFinish(),
        ]),
      ],
      [
        'an `afterAll` that failed',
        createOutcome([
          start,
          load,
          createHook({ type: 'afterAll' }),
          createFinish(),
        ]),
      ],
      [
        'snapshots left unchecked or unmatched',
        createOutcome([start, load, createFinish({ snapshots: 1 })]),
      ],
      [
        'an error outside any test',
        createOutcome([start, load, createFinish({ execError: 'outside' })]),
      ],
      [
        'a file that failed',
        createOutcome([
          start,
          createFinish({
            outcome: 'failure',
            message: 'broken',
            realm: 'current',
          }),
        ]),
      ],
      [
        'a file with no tests',
        createOutcome([
          start,
          load,
          createFinish({ message: 'no tests', outcome: 'empty' }),
        ]),
      ],
      [
        'more hits than the limit',
        createOutcome([start, load, createFinish({ hits: 101 })]),
      ],
      ['a hang', createHang([start, load, createTry()])],
      ['an exit, the first time', createExit([start, load])],
      [
        'a test that failed after an attempt that passed',
        createOutcome([
          start,
          load,
          createTry(),
          createFailed(),
          createFinish(),
        ]),
      ],
    ])('gives no facts for %s', (_name, outcome) => {
      expect(buildIsolatedFacts(outcome, input)).toBeNull()
    })

    it.each<[string, UnitOutcome]>([
      ['a hang', createHang([start, load])],
      ['an exit', createExit([start, load])],
      ['a worker that did not boot', createExit([])],
    ])('gives no facts for %s, even when retrying', (_name, outcome) => {
      expect(
        buildIsolatedFacts(outcome, { ...input, retrying: true }),
      ).toBeNull()
    })

    it('gives facts for a clean pass', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([start, load, createTry(), createFinish()]),
          input,
        ),
      ).toMatchObject({ incomplete: null, hookError: null, reached: false })
    })

    it('gives facts for a `beforeAll` that failed with only a todo under it', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([start, load, createHook(), createFinish()]),
          input,
        ),
      ).toMatchObject({ hookError: null, timedOut: false, reached: false })
    })

    it('gives facts for hits at the limit', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([start, load, createFinish({ hits: 100 })]),
          input,
        ),
      ).toMatchObject({ reached: false, hits: 100 })
    })

    it('gives facts for a test that fails an attempt and passes on retry, as in plain Jest', () => {
      let facts = buildIsolatedFacts(
        createOutcome([
          start,
          load,
          createFailed(),
          createTry(),
          createFinish(),
        ]),
        input,
      )

      expect(facts?.tests).toMatchObject([{ reached: false, failed: false }])
    })

    it('gives no facts for a test that fails an attempt and then fails', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([
            start,
            load,
            createFailed({ message: 'first' }),
            createFailed({ message: 'last' }),
            createFinish(),
          ]),
          input,
        ),
      ).toBeNull()
    })
  })

  describe('with a reach', () => {
    it('gives facts for a test that failed', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([
            start,
            load,
            reach,
            createFailed({ reached: true }),
            createFinish(),
          ]),
          input,
        )?.tests,
      ).toMatchObject([{ message: 'boom', reached: true, failed: true }])
    })

    it('gives facts for more hits than the limit', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([start, load, reach, createFinish({ hits: 101 })]),
          input,
        ),
      ).toMatchObject({ reached: true, hits: 101 })
    })

    it('gives a file that failed its load error, with no load record', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([
            start,
            reach,
            createFinish({
              message: 'thrown at load',
              outcome: 'failure',
              realm: 'current',
            }),
          ]),
          input,
        ),
      ).toMatchObject({ loadError: 'thrown at load', hookError: null })
    })

    // Circus writes `load` first, so only a framework with no events gets here.
    it('reads a file with no tests and no load record as a load error', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([
            start,
            reach,
            createFinish({ message: 'no tests', outcome: 'empty' }),
          ]),
          input,
        ),
      ).toMatchObject({ loadError: 'no tests', hookError: null })
    })

    it('reads a file with no tests after its load as a hook error', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([
            start,
            reach,
            load,
            createFinish({ message: 'no tests', outcome: 'empty' }),
          ]),
          input,
        ),
      ).toMatchObject({ hookError: 'no tests', loadError: null })
    })

    it('takes the failure of the file first for the hook error', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([
            start,
            load,
            reach,
            createHook({ type: 'afterAll' }),
            createFinish({
              message: 'the teardown broke',
              outcome: 'failure',
              realm: 'host',
            }),
          ]),
          clean,
        ),
      ).toMatchObject({ hookError: 'the teardown broke', loadError: null })
    })

    it('takes the first afterAll next, then the error outside any test, then the snapshots left', () => {
      let snapshots = 1

      expect(
        buildIsolatedFacts(
          createOutcome([
            start,
            load,
            reach,
            createHook({ message: 'first', type: 'afterAll' }),
            createHook({ message: 'second', type: 'afterAll' }),
            createFinish({ execError: 'Error: first', snapshots }),
          ]),
          clean,
        ),
      ).toMatchObject({ hookError: 'first' })
      expect(
        buildIsolatedFacts(
          createOutcome([
            start,
            load,
            reach,
            createFinish({ execError: 'outside', snapshots }),
          ]),
          clean,
        ),
      ).toMatchObject({ hookError: 'outside' })
      expect(
        buildIsolatedFacts(
          createOutcome([start, load, reach, createFinish({ snapshots })]),
          input,
        ),
      ).toMatchObject({
        hookError: 'Snapshots went unchecked or failed, which fails the run.',
        reached: true,
      })
    })

    it('leaves a beforeAll that failed before the reach to the tests under it', () => {
      let facts = buildIsolatedFacts(
        createOutcome([
          start,
          load,
          createHook({ message: 'the connection dropped' }),
          createFailed({ message: 'the connection dropped', name: 'first' }),
          reach,
          createTry({ name: 'second', reached: true }),
          createFinish(),
        ]),
        input,
      )

      expect(facts).toMatchObject({
        tests: [
          { message: 'the connection dropped', reached: false, failed: true },
          { reached: true, failed: false },
        ],
        hookError: null,
        timedOut: false,
        reached: true,
      })
    })

    it('leaves a beforeAll that failed to a test that then passed, or a todo', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([
            start,
            load,
            reach,
            createHook(),
            createFailed({ reached: true }),
            createTry({ reached: true }),
            createFinish(),
          ]),
          input,
        ),
      ).toMatchObject({ tests: [{ failed: false }], hookError: null })
      expect(
        buildIsolatedFacts(
          createOutcome([
            start,
            load,
            reach,
            createHook(),
            createTry({ name: 'beside the todo', reached: true }),
            createFinish(),
          ]),
          input,
        ),
      ).toMatchObject({ tests: [{ failed: false }], hookError: null })
    })

    it('tells a hook that ran past its timeout, and one that did not', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([
            start,
            load,
            reach,
            createHook({ type: 'afterAll' }),
            createHook({ type: 'afterAll', timedOut: true }),
            createFinish({ execError: 'Error: the hook broke' }),
          ]),
          clean,
        ),
      ).toMatchObject({ timedOut: true })
      expect(
        buildIsolatedFacts(
          createOutcome([
            start,
            load,
            reach,
            createHook({ type: 'afterAll' }),
            createFinish({ execError: 'Error: the hook broke' }),
          ]),
          clean,
        ),
      ).toMatchObject({ timedOut: false })
    })

    it('reads a beforeAll that ran past its timeout through the test under it', () => {
      let message = 'Exceeded timeout of 5 ms for a hook.'

      expect(
        buildIsolatedFacts(
          createOutcome([
            start,
            load,
            reach,
            createHook({ timedOut: true, message }),
            createFailed({
              realm: 'primitive',
              timedOut: true,
              reached: true,
              message,
            }),
            createFinish(),
          ]),
          input,
        ),
      ).toMatchObject({ tests: [{ timedOut: true }], timedOut: false })
    })

    it('reads an exit as a crash when retrying', () => {
      expect(
        buildIsolatedFacts(createExit([start, load, reach]), {
          ...input,
          retrying: true,
        }),
      ).toMatchObject({ incomplete: 'crash', reached: true })
    })

    it('gives no facts for an exit the first time', () => {
      expect(
        buildIsolatedFacts(createExit([start, load, reach]), input),
      ).toBeNull()
    })

    it('reads a hang the first time, and when retrying', () => {
      let outcome = createHang([start, load, reach])

      expect(buildIsolatedFacts(outcome, input)).toMatchObject({
        incomplete: 'hang',
      })
      expect(
        buildIsolatedFacts(outcome, { ...input, retrying: true }),
      ).toMatchObject({ incomplete: 'hang' })
    })

    it('gives no facts for a done message with no finish, even when retrying', () => {
      let outcome = createOutcome([start, load, reach], { done: false })

      expect(buildIsolatedFacts(outcome, input)).toBeNull()
      expect(
        buildIsolatedFacts(outcome, { ...input, retrying: true }),
      ).toBeNull()
    })

    it('reads a worker that a signal ended as a crash when retrying', () => {
      let outcome = createOutcome([start, load, reach], {
        signal: 'SIGKILL',
        done: false,
      })

      expect(buildIsolatedFacts(outcome, input)).toBeNull()
      expect(
        buildIsolatedFacts(outcome, { ...input, retrying: true }),
      ).toMatchObject({ incomplete: 'crash' })
    })

    it('reads a finish with no done message as an end with all its facts', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([start, load, reach, createFinish()], { code: 0 }),
          input,
        ),
      ).toMatchObject({ incomplete: null, duration: 80 })
    })

    it('reads no hang from a worker the watchdog stopped past finish', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([start, load, reach, createFinish()], {
            signal: 'SIGKILL',
          }),
          input,
        ),
      ).toMatchObject({ incomplete: null })
    })
  })

  describe('with an error of an earlier unit', () => {
    it.each<[string, JestTimedRecord[]]>([
      ['a stale record', [{ message: 'old', kind: 'stale', time: 35 }]],
      [
        'a failed attempt that is stale',
        [createFailed({ realm: 'stale', reached: true })],
      ],
      [
        'a failed attempt that is stale, of a test that then passed',
        [createFailed({ realm: 'stale', reached: true }), createTry()],
      ],
      [
        'a failed attempt that is stale, before the attempts of a test that fails',
        [
          createFailed({ realm: 'stale', reached: true }),
          createFailed({ reached: true }),
        ],
      ],
    ])('gives no facts for %s', (_name, records) => {
      expect(
        buildIsolatedFacts(
          createOutcome([start, load, reach, ...records, createFinish()]),
          input,
        ),
      ).toBeNull()
    })

    it('gives no facts for a file whose failure is stale', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([
            start,
            reach,
            createFinish({
              outcome: 'failure',
              message: 'old',
              realm: 'stale',
            }),
          ]),
          input,
        ),
      ).toBeNull()
    })

    it('gives facts for a passing attempt with no realm', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([start, load, reach, createTry(), createFinish()]),
          input,
        ),
      ).toMatchObject({ reached: true })
    })
  })

  describe('with a failure of the host realm', () => {
    let failedTest = createOutcome([
      start,
      load,
      reach,
      createFailed({ realm: 'host', reached: true }),
      createFinish(),
    ])
    let failedFile = createOutcome([
      start,
      reach,
      createFinish({ outcome: 'failure', realm: 'host', message: 'm' }),
    ])

    it('gives no facts for a test on an attempt that is not clean', () => {
      expect(buildIsolatedFacts(failedTest, input)).toBeNull()
    })

    it('gives no facts for a file on an attempt that is not clean', () => {
      expect(buildIsolatedFacts(failedFile, input)).toBeNull()
    })

    it('gives facts for a test on a clean attempt', () => {
      expect(buildIsolatedFacts(failedTest, clean)?.tests).toMatchObject([
        { failed: true },
      ])
    })

    it('gives facts for a file on a clean attempt', () => {
      expect(buildIsolatedFacts(failedFile, clean)).toMatchObject({
        loadError: 'm',
      })
    })

    it('gives facts on an attempt that is not clean for a test that passed on retry', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([
            start,
            load,
            reach,
            createFailed({ realm: 'host', reached: true }),
            createTry({ reached: true }),
            createFinish(),
          ]),
          input,
        )?.tests,
      ).toMatchObject([{ failed: false }])
    })

    it('gives facts on an attempt that is not clean for a failure of the vm', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([
            start,
            load,
            reach,
            createFailed({ reached: true }),
            createFinish(),
          ]),
          input,
        )?.tests,
      ).toMatchObject([{ failed: true }])
    })
  })

  describe('with an error outside any test', () => {
    let outcome = createOutcome([
      start,
      load,
      reach,
      createFinish({ execError: 'outside' }),
    ])

    it('gives no facts on an attempt that is not clean', () => {
      expect(buildIsolatedFacts(outcome, input)).toBeNull()
    })

    it('gives its hook error on a clean attempt', () => {
      expect(buildIsolatedFacts(outcome, clean)).toMatchObject({
        hookError: 'outside',
        reached: true,
      })
    })
  })

  describe('with a worker that ran out of memory', () => {
    it.each<[string, JestTimedRecord[]]>([
      ['no reach', [start, load]],
      ['a reach', [start, load, reach]],
      ['a reach, when retrying', [start, load, reach]],
    ])('gives no facts with %s', (name, records) => {
      expect(
        buildIsolatedFacts(
          createOutcome(records, {
            signal: 'SIGABRT',
            outOfMemory: 512,
            done: false,
          }),
          { ...input, retrying: name.endsWith('retrying') },
        ),
      ).toBeNull()
    })

    it('gives no facts for a worker that the watchdog stopped as it ran out', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([start, load, reach], {
            signal: 'SIGABRT',
            outOfMemory: 512,
            done: false,
            hung: true,
          }),
          input,
        ),
      ).toBeNull()
    })

    it('gives no facts for a worker that ran out after the unit ended', () => {
      expect(
        buildIsolatedFacts(
          createOutcome([start, load, reach, createFinish()], {
            signal: 'SIGABRT',
            outOfMemory: 512,
          }),
          input,
        ),
      ).toBeNull()
    })

    it('reads that exit on a clean attempt as an exit, the second time as a crash', () => {
      let outcome = createOutcome([start, load, reach], {
        signal: 'SIGABRT',
        done: false,
      })

      expect(buildIsolatedFacts(outcome, clean)).toBeNull()
      expect(
        buildIsolatedFacts(outcome, { ...clean, retrying: true }),
      ).toMatchObject({ incomplete: 'crash', reached: true })
    })
  })

  it('gives no facts for a tracker error, whose try is lost', () => {
    expect(
      buildIsolatedFacts(
        createOutcome([
          start,
          load,
          reach,
          { kind: 'tracker-error', event: 'test_done', message: 'm', time: 35 },
          createFinish(),
        ]),
        input,
      ),
    ).toBeNull()
  })

  it('builds the facts of a clean unit', () => {
    let attempt = createTry({ reached: true, occurrence: 1, name: 'b' })

    expect(
      buildIsolatedFacts(
        createOutcome([start, load, reach, attempt, createFinish()]),
        input,
      ),
    ).toStrictEqual({
      tests: [
        {
          test: getTestId('/p', '/p/a.test.js', { occurrence: 1, name: 'b' }),
          timedOut: false,
          skipped: false,
          reached: true,
          failed: false,
          message: null,
          covers: null,
          duration: 7,
          mutant: 'm',
          strays: [],
          hits: 1,
        },
      ],
      incomplete: null,
      timedOut: false,
      hookError: null,
      loadError: null,
      reached: true,
      duration: 80,
      startup: 12,
      strays: [],
      unit: 4,
      hits: 5,
    })
  })

  it('folds the attempts of a test, in the order of their first attempts', () => {
    let facts = buildIsolatedFacts(
      createOutcome([
        start,
        load,
        createFailed({ name: 'b' }),
        createTry({ name: 'a' }),
        reach,
        createTry({ reached: true, name: 'b' }),
        createFinish(),
      ]),
      input,
    )

    expect(
      facts?.tests.map(test => [
        test.test,
        test.failed,
        test.message,
        test.reached,
        test.duration,
        test.hits,
      ]),
    ).toStrictEqual([
      [
        getTestId('/p', '/p/a.test.js', { occurrence: 0, name: 'b' }),
        false,
        null,
        true,
        14,
        2,
      ],
      [
        getTestId('/p', '/p/a.test.js', { occurrence: 0, name: 'a' }),
        false,
        null,
        false,
        7,
        1,
      ],
    ])
  })

  it('gives every test of a concurrent file the reach of the unit', () => {
    let records = [
      start,
      { kind: 'concurrent', time: 15 } as const,
      load,
      createTry({ name: 'a' }),
    ]

    expect(
      buildIsolatedFacts(
        createOutcome([
          ...records,
          reach,
          createTry({ reached: true, name: 'b' }),
          createFinish(),
        ]),
        input,
      )?.tests.map(test => test.reached),
    ).toStrictEqual([true, true])
    expect(
      buildIsolatedFacts(
        createOutcome([...records, createTry({ name: 'b' }), createFinish()]),
        input,
      )?.tests.map(test => test.reached),
    ).toStrictEqual([false, false])
  })

  it('gives every test of a file that is not concurrent its own reach', () => {
    expect(
      buildIsolatedFacts(
        createOutcome([
          start,
          load,
          createTry({ name: 'a' }),
          reach,
          createTry({ reached: true, name: 'b' }),
          createFinish(),
        ]),
        input,
      )?.tests.map(test => test.reached),
    ).toStrictEqual([false, true])
  })

  it('holds the project in test ids, as the dry run does', () => {
    let facts = buildIsolatedFacts(
      createOutcome([start, load, createTry(), createFinish()]),
      { ...input, project: 'unit' },
    )

    expect(facts?.tests[0]?.test).toBe(
      getTestId('/p', '/p/a.test.js', {
        project: 'unit',
        occurrence: 0,
        name: 'a',
      }),
    )
    expect(facts?.tests[0]?.test).not.toBe(
      getTestId('/p', '/p/a.test.js', { occurrence: 0, name: 'a' }),
    )
  })

  it('takes hits from finish, the highest of a unit that ended', () => {
    expect(
      buildIsolatedFacts(
        createOutcome([start, load, createTry(), createFinish({ hits: 5 })]),
        input,
      )?.hits,
    ).toBe(5)
  })

  it('takes the highest hits of any record without finish', () => {
    expect(
      buildIsolatedFacts(
        createHang([
          start,
          { kind: 'load', covers: [], time: 20, hits: 9 },
          { kind: 'reached', hits: 40, time: 30 },
          createTry({ hits: 3 }),
        ]),
        input,
      )?.hits,
    ).toBe(40)
  })

  it('reads any number of records of a unit with no finish', () => {
    let records = Array.from({ length: 200_000 }, () => load)

    expect(
      buildIsolatedFacts(createHang([start, reach, ...records]), input),
    ).toMatchObject({ incomplete: 'hang', hits: 3 })
  })

  it('takes the last record for the end of a unit with no finish', () => {
    expect(
      buildIsolatedFacts(
        createHang([start, load, reach, createTry({ time: 70 })]),
        input,
      ),
    ).toMatchObject({ incomplete: 'hang', duration: 60 })
  })

  // A write the disk cut short can take the first line with it.
  it('gives zeros to a unit with a reach and no start', () => {
    expect(
      buildIsolatedFacts(
        createHang([{ kind: 'reached', hits: 0, time: 3 }]),
        input,
      ),
    ).toMatchObject({ duration: 0, hits: 0 })
  })
})
