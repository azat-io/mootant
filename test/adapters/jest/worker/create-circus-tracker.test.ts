import { describe, expect, it, vi } from 'vitest'
import { runInNewContext } from 'node:vm'

import type { CircusEvent } from '../../../../adapters/jest/types/circus-event'
import type { CircusState } from '../../../../adapters/jest/types/circus-state'
import type { JestRecord } from '../../../../adapters/jest/types/jest-record'
import type { VmSide } from '../../../../adapters/jest/types/vm-side'

import { createCircusTracker } from '../../../../adapters/jest/worker/create-circus-tracker'

/**
 * `Error` of the vm of a unit that ended.
 */
let DeadError = runInNewContext('Error') as ErrorConstructor

/**
 * A running tracker with what it reports to.
 */
interface Harness {
  /**
   * Runs a test through an attempt.
   */
  run(test: FakeTest, body?: () => void): void

  /**
   * Passes an event to the tracker.
   */
  handle(event: CircusEvent): void

  /**
   * Evaluates mutant sites.
   */
  evaluate(...ids: string[]): void

  /**
   * Moves the clock of the tracker forward.
   */
  tick(milliseconds: number): void

  /**
   * Coverage of the file as the tracker started.
   */
  coverage: Set<string> | null

  /**
   * Called when the tracker keeps Jest from writing the snapshot file.
   */
  freezeSnapshots(): void

  /**
   * Records written so far.
   */
  records: JestRecord[]

  /**
   * What the file looks like to the tracker.
   */
  state: CircusState

  /**
   * Called when a stale error showed up.
   */
  onStale(): void

  /**
   * Turns the side's sticky flag on.
   */
  reach(): void
}

/**
 * A test as circus keeps it, with as much as the tracker reads.
 */
interface FakeTest {
  /**
   * Own timeout of the test.
   */
  timeout: undefined | number

  /**
   * What circus keeps for each failure.
   */
  errors: unknown[]

  /**
   * Kind of the child.
   */
  type: 'test'

  /**
   * Name of the test.
   */
  name: string
}

/**
 * Starts a tracker for a file with the given tests.
 *
 * @param children - Tests and blocks at the top of the file.
 * @param options - What differs from a dry unit.
 * @param options.dry - Whether the unit is a dry run.
 * @returns The running tracker.
 */
function start(
  children: CircusState['rootDescribeBlock']['children'],
  options: { dry?: boolean } = {},
): Harness {
  let dry = options.dry ?? true
  let coverage = dry ? new Set<string>() : null
  let records: JestRecord[] = []
  let reached = false
  let time = 1000
  let side: VmSide = {
    runtime: {
      hitLimit: Infinity,
      hit: () => false,
      reached: false,
      active: null,
      coverage,
      hits: 0,
    },
    isReached: () => reached,
    listVariables: () => [],
    realmError: Error,
    addVariable() {},
    stopTimers() {},
    close() {},
  }
  let freezeSnapshots = vi.fn<() => void>()
  let onStale = vi.fn<() => void>()
  let tracker = createCircusTracker({
    realms: { dead: new WeakSet<object>([DeadError]), current: null },
    write(record) {
      records.push(record)
    },
    now: () => time,
    freezeSnapshots,
    onStale,
    side,
    dry,
  })
  let state: CircusState = {
    rootDescribeBlock: createBlock('ROOT_DESCRIBE_BLOCK', children),
    testTimeout: 5000,
  }

  /**
   * Passes an event to the tracker.
   *
   * @param event - What circus dispatches.
   */
  function handle(event: CircusEvent): void {
    tracker(event, state)
  }

  return {
    run(test, body) {
      test.errors = []
      handle({ name: 'test_started', test })
      body?.()
      handle({ name: 'test_done', test })
    },
    evaluate(...ids) {
      for (let id of ids) {
        side.runtime.hits += 1
        side.runtime.coverage?.add(id)
      }
    },
    tick(milliseconds) {
      time += milliseconds
    },
    reach() {
      reached = true
    },
    freezeSnapshots,
    coverage,
    onStale,
    records,
    handle,
    state,
  }
}

/**
 * Gives the records of a kind.
 *
 * @param records - All records.
 * @param kind - Kind to keep.
 * @returns The records of that kind.
 */
function ofKind<Kind extends JestRecord['kind']>(
  records: JestRecord[],
  kind: Kind,
): Extract<JestRecord, { kind: Kind }>[] {
  return records.filter(record => record.kind === kind) as never
}

/**
 * Creates a block of tests.
 *
 * @param name - What `describe` was given.
 * @param children - Tests and blocks in the block.
 * @returns A block as circus keeps it.
 */
function createBlock(
  name: string,
  children: CircusState['rootDescribeBlock']['children'],
): CircusState['rootDescribeBlock'] {
  return { type: 'describeBlock', children, name }
}

/**
 * Creates a test no attempt has started.
 *
 * @param name - What `it` was given.
 * @param fields - Fields that differ from those of a plain test.
 * @returns A test as circus keeps it.
 */
function createTest(name: string, fields: Partial<FakeTest> = {}): FakeTest {
  return {
    timeout: undefined,
    type: 'test',
    errors: [],
    name,
    ...fields,
  }
}

describe('createCircusTracker', () => {
  describe('add_test', () => {
    it('writes one record however many concurrent tests the file adds', () => {
      let { records, handle } = start([])
      handle({ concurrent: false, name: 'add_test' })

      expect(records).toStrictEqual([])

      handle({ name: 'add_test', concurrent: true })
      handle({ name: 'add_test', concurrent: true })

      expect(records).toStrictEqual([{ kind: 'concurrent' }])
    })
  })

  describe('run_start', () => {
    it('keeps Jest from writing the snapshot file', () => {
      let { freezeSnapshots, handle } = start([])

      expect(freezeSnapshots).not.toHaveBeenCalled()

      handle({ name: 'run_start' })

      expect(freezeSnapshots).toHaveBeenCalledExactlyOnceWith()
    })

    it('writes what the load evaluated, sorted', () => {
      let { evaluate, records, handle } = start([])
      evaluate('b', 'a', 'b')
      handle({ name: 'run_start' })

      expect(records).toStrictEqual([
        { covers: ['a', 'b'], kind: 'load', hits: 3 },
      ])
    })

    it('writes no covers without coverage, and the hits', () => {
      let { evaluate, records, handle } = start([], { dry: false })
      evaluate('a')
      handle({ name: 'run_start' })

      expect(records).toStrictEqual([{ kind: 'load', covers: [], hits: 1 }])
    })

    it('gives ids in the order of definition, whatever order tests run in', () => {
      let first = createTest('first')
      let second = createTest('second')
      let { records, handle, run } = start([first, second])
      handle({ name: 'run_start' })
      run(second)
      run(first)

      expect(ofKind(records, 'open')).toStrictEqual([
        { name: 'second', timeout: 5000, occurrence: 0, kind: 'open' },
        { name: 'first', timeout: 5000, occurrence: 0, kind: 'open' },
      ])
    })

    it('counts duplicate names by definition, not by running', () => {
      let first = createTest('same')
      let second = createTest('same')
      let { records, handle, run } = start([first, second])
      handle({ name: 'run_start' })
      run(second)
      run(first)

      expect(ofKind(records, 'try').map(item => item.occurrence)).toStrictEqual(
        [1, 0],
      )
    })

    it('joins the names of nested blocks without the root and counts per full name', () => {
      let top = createTest('same')
      let nested = createTest('same')
      let deep = createTest('same')
      let twin = createTest('same')
      let { records, handle, run } = start([
        top,
        createBlock('outer', [
          nested,
          createBlock('inner', [deep]),
          createBlock('inner', [twin]),
        ]),
      ])
      handle({ name: 'run_start' })
      run(top)
      run(nested)
      run(deep)
      run(twin)

      expect(
        ofKind(records, 'open').map(item => [item.name, item.occurrence]),
      ).toStrictEqual([
        ['same', 0],
        ['outer > same', 0],
        ['outer > inner > same', 0],
        ['outer > inner > same', 1],
      ])
    })
  })

  describe('test_started', () => {
    it('writes the timeout of the test, or the state', () => {
      let own = createTest('own', { timeout: 100 })
      let zero = createTest('zero', { timeout: 0 })
      let plain = createTest('plain')
      let { records, handle, run } = start([own, zero, plain])
      handle({ name: 'run_start' })
      run(own)
      run(zero)
      run(plain)

      expect(ofKind(records, 'open').map(item => item.timeout)).toStrictEqual([
        100, 5000, 5000,
      ])
    })

    it('writes nothing for a test that circus comes to and never runs', () => {
      let focused = createTest('focused')
      let left = createTest('left')
      let { records, handle, run } = start([focused, left])
      handle({ name: 'run_start' })
      records.length = 0
      handle({ name: 'test_start', test: left } as never)
      handle({ name: 'test_skip', test: left } as never)

      expect(records).toStrictEqual([])

      run(focused)

      expect(records.map(record => record.kind)).toStrictEqual(['open', 'try'])
    })
  })

  describe('hook_start', () => {
    it('beats with the timeout of the hook, or the state, in a dry run', () => {
      let { records, handle } = start([])
      handle({
        hook: { type: 'beforeAll', timeout: 100 },
        name: 'hook_start',
      })
      handle({
        hook: { timeout: undefined, type: 'afterEach' },
        name: 'hook_start',
      })

      expect(records).toStrictEqual([
        { kind: 'beat', timeout: 100 },
        { timeout: 5000, kind: 'beat' },
      ])
    })

    it('writes nothing in a unit with a mutant', () => {
      let { records, handle } = start([], { dry: false })
      handle({
        hook: { type: 'beforeAll', timeout: 100 },
        name: 'hook_start',
      })

      expect(records).toStrictEqual([])
    })
  })

  describe('test_done', () => {
    it('writes a passed attempt with its hits and duration', () => {
      let test = createTest('a')
      let { evaluate, records, handle, tick, run } = start([test])
      evaluate('load')
      handle({ name: 'run_start' })
      run(test, () => {
        evaluate('b', 'a')
        tick(25)
      })

      expect(ofKind(records, 'try')).toStrictEqual([
        {
          covers: ['a', 'b'],
          timedOut: false,
          reached: false,
          occurrence: 0,
          message: null,
          failed: false,
          duration: 25,
          realm: null,
          kind: 'try',
          name: 'a',
          hits: 2,
        },
      ])
    })

    it('writes the message and realm of the first failure', () => {
      let test = createTest('a')
      let { records, handle, run } = start([test])
      handle({ name: 'run_start' })
      run(test, () => {
        test.errors = [
          [new Error('first\nmore'), new Error('async')],
          new Error('second'),
        ]
      })

      expect(ofKind(records, 'try')[0]).toMatchObject({
        message: 'first',
        timedOut: false,
        realm: 'host',
        failed: true,
      })
    })

    it('reads a failure that holds the text of a timeout as timed out', () => {
      let test = createTest('a')
      let { records, handle, run } = start([test])
      handle({ name: 'run_start' })
      run(test, () => {
        test.errors = [
          ['Exceeded timeout of 5000 ms for a test.', new Error('async')],
        ]
      })

      expect(ofKind(records, 'try')[0]).toMatchObject({
        message: 'Exceeded timeout of 5000 ms for a test.',
        realm: 'primitive',
        timedOut: true,
        failed: true,
      })
    })

    it('reads a timeout while waiting for done as timed out', () => {
      let test = createTest('a')
      let { records, handle, run } = start([test])
      handle({ name: 'run_start' })
      run(test, () => {
        test.errors = [
          [
            'Exceeded timeout of 0.5 ms for a test while waiting for `done()` to be called.',
            new Error('async'),
          ],
        ]
      })

      expect(ofKind(records, 'try')[0]).toMatchObject({ timedOut: true })
    })

    it.each([
      'Exceeded timeout of the upstream call',
      'The call failed: Exceeded timeout of 5000 ms for a test.',
    ])('reads a failure of the project as a failure: %s', message => {
      let test = createTest('a')
      let { records, handle, run } = start([test])
      handle({ name: 'run_start' })
      run(test, () => {
        test.errors = [new Error(message)]
      })

      expect(ofKind(records, 'try')[0]).toMatchObject({
        timedOut: false,
        failed: true,
        message,
      })
    })

    it('writes the side flag at the end of the attempt, sticky over later ones', () => {
      let first = createTest('first')
      let second = createTest('second')
      let { records, handle, reach, run } = start([first, second])
      handle({ name: 'run_start' })
      run(first, reach)
      run(second)

      expect(ofKind(records, 'try').map(item => item.reached)).toStrictEqual([
        true,
        true,
      ])
    })

    it('gives two records with one id to a test that retries', () => {
      let test = createTest('a')
      let { evaluate, records, handle, run } = start([test])
      handle({ name: 'run_start' })
      run(test, () => {
        evaluate('x')
        test.errors = [new Error('boom')]
      })
      run(test, () => {
        evaluate('y', 'z')
      })

      expect(
        ofKind(records, 'try').map(item => [
          item.name,
          item.occurrence,
          item.failed,
          item.hits,
          item.covers,
        ]),
      ).toStrictEqual([
        ['a', 0, true, 1, ['x']],
        ['a', 0, false, 2, ['y', 'z']],
      ])
    })

    it('holds only the sites of the attempt in a dry try, and brings the file set back', () => {
      let test = createTest('a')
      let { evaluate, coverage, records, handle, run } = start([test])
      evaluate('load')
      handle({ name: 'run_start' })
      run(test, () => {
        evaluate('body')
      })
      evaluate('hook')

      expect(ofKind(records, 'try')[0]?.covers).toStrictEqual(['body'])
      expect([...coverage!]).toStrictEqual(['load', 'hook'])
    })

    it('keeps the file set and no covers in a concurrent file, with attempts apart by test', () => {
      let first = createTest('same')
      let second = createTest('same')
      let { evaluate, coverage, records, handle } = start([first, second])
      handle({ name: 'add_test', concurrent: true })
      handle({ name: 'run_start' })
      handle({ name: 'test_started', test: first })
      handle({ name: 'test_started', test: second })
      evaluate('during')
      handle({ name: 'test_done', test: second })
      evaluate('between')
      handle({ name: 'test_done', test: first })

      expect(ofKind(records, 'try').map(item => item.covers)).toStrictEqual([
        null,
        null,
      ])
      expect(
        ofKind(records, 'try').map(item => [item.occurrence, item.hits]),
      ).toStrictEqual([
        [1, 1],
        [0, 2],
      ])
      expect([...coverage!]).toStrictEqual(['during', 'between'])
    })

    it('writes no covers in a unit with a mutant', () => {
      let test = createTest('a')
      let { records, handle, run } = start([test], { dry: false })
      handle({ name: 'run_start' })
      run(test)

      expect(ofKind(records, 'try')[0]?.covers).toBeNull()
    })

    it('calls onStale for a try whose realm is stale, and only then', () => {
      let passed = createTest('passed')
      let failed = createTest('failed')
      let stale = createTest('stale')
      let { onStale, records, handle, run } = start([passed, failed, stale])
      handle({ name: 'run_start' })
      run(passed)
      run(failed, () => {
        failed.errors = [new Error('host')]
      })

      expect(onStale).not.toHaveBeenCalled()

      run(stale, () => {
        stale.errors = [new DeadError('late')]
      })

      expect(onStale).toHaveBeenCalledExactlyOnceWith()
      expect(ofKind(records, 'try')[2]?.realm).toBe('stale')
    })

    it('throws on a test with no open attempt, which the caller catches', () => {
      let test = createTest('a')
      let { handle } = start([test])
      handle({ name: 'run_start' })

      expect(() => {
        handle({ name: 'test_done', test })
      }).toThrow(TypeError)
    })

    it('forgets the attempt', () => {
      let test = createTest('a')
      let { handle, run } = start([test])
      handle({ name: 'run_start' })
      run(test)

      expect(() => {
        handle({ name: 'test_done', test })
      }).toThrow(TypeError)
    })
  })

  describe('every test of a unit', () => {
    it('runs after a test that failed past the reach, nothing skipped', () => {
      let failing = createTest('failing')
      let later = createTest('later')
      let { records, handle, reach, run } = start(
        [failing, createBlock('block', [later])],
        { dry: false },
      )
      handle({ name: 'run_start' })
      reach()
      run(failing, () => {
        failing.errors = [new Error('boom')]
      })
      run(later)

      expect(failing).not.toHaveProperty('mode')
      expect(later).not.toHaveProperty('mode')
      expect(
        ofKind(records, 'try').map(({ failed, name }) => [name, failed]),
      ).toStrictEqual([
        ['failing', true],
        ['block > later', false],
      ])
    })
  })

  describe('run_finish', () => {
    it('writes one more failed try for a test that got errors after its last attempt passed', () => {
      let late = createTest('late')
      let clean = createTest('clean')
      let { onStale, records, handle, reach, run } = start([late, clean])
      handle({ name: 'run_start' })
      run(late)
      run(clean)
      reach()
      late.errors = [[new Error('boom\nmore'), new Error('async')]]
      records.length = 0
      handle({ name: 'run_finish' })

      expect(records).toStrictEqual([
        {
          timedOut: false,
          message: 'boom',
          occurrence: 0,
          reached: true,
          realm: 'host',
          failed: true,
          covers: null,
          name: 'late',
          kind: 'try',
          duration: 0,
          hits: 0,
        },
      ])
      expect(onStale).not.toHaveBeenCalled()
    })

    it('reads a timeout and a stale realm in errors that came late', () => {
      let timedOut = createTest('timed out')
      let stale = createTest('stale')
      let { onStale, records, handle, run } = start([timedOut, stale])
      handle({ name: 'run_start' })
      run(timedOut)
      run(stale)
      timedOut.errors = ['Exceeded timeout of 5000 ms for a test.']
      stale.errors = [new DeadError('late')]
      records.length = 0
      handle({ name: 'run_finish' })

      expect(ofKind(records, 'try')[0]).toMatchObject({
        realm: 'primitive',
        timedOut: true,
      })
      expect(ofKind(records, 'try')[1]).toMatchObject({ realm: 'stale' })
      expect(onStale).toHaveBeenCalledExactlyOnceWith()
    })

    it('counts the last attempt of a test that retried', () => {
      let passedLast = createTest('passed last')
      let failedLast = createTest('failed last')
      let { records, handle, run } = start([passedLast, failedLast])
      handle({ name: 'run_start' })
      run(passedLast, () => {
        passedLast.errors = [new Error('first attempt')]
      })
      run(passedLast)
      run(failedLast)
      run(failedLast, () => {
        failedLast.errors = [new Error('second attempt')]
      })
      passedLast.errors = [new Error('late')]
      records.length = 0
      handle({ name: 'run_finish' })

      expect(ofKind(records, 'try').map(item => item.name)).toStrictEqual([
        'passed last',
      ])
    })

    it('writes one more passed try for a test whose errors went after its last attempt failed, as an environment that keeps it in quarantine takes them', () => {
      let quarantined = createTest('quarantined')
      let failing = createTest('failing')
      let { records, handle, run } = start([quarantined, failing])
      handle({ name: 'run_start' })
      run(quarantined, () => {
        quarantined.errors = [new Error('flaky')]
      })
      run(failing, () => {
        failing.errors = [new Error('wrong')]
      })
      quarantined.errors = []
      records.length = 0
      handle({ name: 'run_finish' })

      expect(
        ofKind(records, 'try').map(({ message, failed, name }) => [
          name,
          failed,
          message,
        ]),
      ).toStrictEqual([['quarantined', false, null]])
    })

    it('writes nothing for a test that passed and holds no error, or one that never ran', () => {
      let clean = createTest('clean')
      let skipped = createTest('skipped', { errors: [new Error('hook')] })
      let { records, handle, run } = start([clean, skipped])
      handle({ name: 'run_start' })
      run(clean)
      records.length = 0
      handle({ name: 'run_finish' })

      expect(records).toStrictEqual([])
    })
  })

  describe('hook_failure', () => {
    it('writes a failure of a beforeAll or afterAll hook', () => {
      let { records, handle } = start([])
      handle({
        hook: { timeout: undefined, type: 'beforeAll' },
        error: new Error('boom\nmore'),
        name: 'hook_failure',
      })
      handle({
        error: 'Exceeded timeout of 5000 ms for a hook.',
        hook: { timeout: undefined, type: 'afterAll' },
        name: 'hook_failure',
      })

      expect(records).toStrictEqual([
        { type: 'beforeAll', timedOut: false, message: 'boom', kind: 'hook' },
        {
          message: 'Exceeded timeout of 5000 ms for a hook.',
          type: 'afterAll',
          timedOut: true,
          kind: 'hook',
        },
      ])
    })

    it('reads a hook that failed with an error of the project as no timeout', () => {
      let { records, handle } = start([])
      handle({
        error: new Error('Exceeded timeout of the upstream call'),
        hook: { timeout: undefined, type: 'beforeAll' },
        name: 'hook_failure',
      })

      expect(records).toMatchObject([{ timedOut: false, kind: 'hook' }])
    })

    it('writes nothing for a beforeEach or afterEach hook, whose test fails', () => {
      let { records, handle } = start([])
      handle({
        hook: { type: 'beforeEach', timeout: undefined },
        error: new Error('boom'),
        name: 'hook_failure',
      })
      handle({
        hook: { timeout: undefined, type: 'afterEach' },
        error: new Error('boom'),
        name: 'hook_failure',
      })

      expect(records).toStrictEqual([])
    })
  })

  describe('error', () => {
    it('writes a stale error and calls onStale', () => {
      let { onStale, records, handle } = start([])
      handle({ error: new DeadError('late'), name: 'error' })

      expect(records).toStrictEqual([{ message: 'late', kind: 'stale' }])
      expect(onStale).toHaveBeenCalledExactlyOnceWith()
    })

    it('writes nothing for an error of the host', () => {
      let { onStale, records, handle } = start([])
      handle({ error: new Error('here'), name: 'error' })
      handle({ error: 'text', name: 'error' })

      expect(records).toStrictEqual([])
      expect(onStale).not.toHaveBeenCalled()
    })
  })

  it('leaves other events alone', () => {
    let { records, handle } = start([])
    handle({ name: 'teardown' } as never)

    expect(records).toStrictEqual([])
  })
})
