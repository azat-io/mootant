import { describe, expect, it } from 'vitest'

import type { NodeTestRecord } from '../../../../adapters/node-test/types/node-test-record'
import type { NodeTestUnit } from '../../../../adapters/node-test/types/node-test-unit'
import type { TryContext } from '../../../../adapters/node-test/types/try-context'
import type { MutantRuntime } from '../../../../types/adapter/mutant-runtime'

import { createTryTracker } from '../../../../adapters/node-test/preload/create-try-tracker'

/**
 * Fake test of node:test.
 */
interface FakeTest {
  /**
   * State the context reads from, changed by the test.
   */
  state: { passed: boolean; error: unknown }

  /**
   * Context the root `beforeEach` gets.
   */
  context: TryContext

  /**
   * Runs the functions registered with `after()`.
   */
  end(): void
}

/**
 * Creates a tracker with a fake clock.
 *
 * @param unit - Fields of the unit that differ from a dry run.
 * @returns Tracker, runtime, records, and a setter of the clock.
 */
function setup(unit: Partial<NodeTestUnit> = {}): {
  tracker: ReturnType<typeof createTryTracker>
  records: NodeTestRecord[]
  runtime: MutantRuntime
  at(time: number): void
} {
  let records: NodeTestRecord[] = []
  let runtime = createRuntime()
  let time = 10
  let tracker = createTryTracker({
    unit: {
      hitLimit: null,
      mutant: null,
      expected: [],
      mode: 'dry',
      bail: false,
      ...unit,
    },
    write: record => {
      records.push(record)
    },
    now: () => time,
    started: 10,
    runtime,
  })
  return {
    at: value => {
      time = value
    },
    tracker,
    records,
    runtime,
  }
}

/**
 * Creates a fake test whose state can change after its hooks, as node:test
 * changes it for failed subtests.
 *
 * @param fullName - Suites and name of the test, joined by `>`.
 * @returns Context for the root `beforeEach`, its changeable state and a
 *   function that ends the test's hooks.
 */
function createTest(fullName: string): FakeTest {
  let after: (() => void)[] = []
  let state: FakeTest['state'] = { passed: true, error: null }
  return {
    context: {
      after: function_ => {
        after.push(function_)
      },
      get passed() {
        return state.passed
      },
      get error() {
        return state.error
      },
      fullName,
    },
    end: () => {
      for (let function_ of after) {
        function_()
      }
    },
    state,
  }
}

/**
 * Creates a runtime with the semantics of mootant's own.
 *
 * @returns Runtime that counts hits, records coverage and reaches the active
 *   mutant.
 */
function createRuntime(): MutantRuntime {
  let runtime: MutantRuntime = {
    hit(id) {
      runtime.hits += 1
      runtime.coverage?.add(id)
      if (runtime.active === id) {
        runtime.reached = true
        return true
      }
      return false
    },
    coverage: null,
    reached: true,
    hitLimit: 1,
    active: 'x',
    hits: 5,
  }
  return runtime
}

/**
 * Picks the records of a kind.
 *
 * @param records - Records written.
 * @param kind - Kind to pick.
 * @returns The records of that kind.
 */
function pick<Kind extends NodeTestRecord['kind']>(
  records: NodeTestRecord[],
  kind: Kind,
): Extract<NodeTestRecord, { kind: Kind }>[] {
  return records.filter(
    (record): record is Extract<NodeTestRecord, { kind: Kind }> =>
      record.kind === kind,
  )
}

/**
 * Runs a fake test with no sites between its start and its end.
 *
 * @param tracker - Tracker that sees the test.
 * @param fullName - Suites and name of the test, joined by `>`.
 * @param state - State the context reads from; a passed test when omitted.
 */
function runTest(
  tracker: ReturnType<typeof createTryTracker>,
  fullName: string,
  state: Partial<FakeTest['state']> = {},
): void {
  let test = createTest(fullName)
  Object.assign(test.state, state)
  tracker.open(test.context)
  test.end()
}

let inputs = {
  required: ['/a.cjs'],
  environment: ['A'],
  modified: [],
  files: [],
}

describe('createTryTracker', () => {
  it('records the sites of each try and those outside tries in a dry run', () => {
    let { tracker, records, runtime, at } = setup()

    expect(runtime).toMatchObject({
      hitLimit: Infinity,
      reached: false,
      active: null,
      hits: 0,
    })

    runtime.hit('load')
    tracker.loaded()
    tracker.loaded()
    at(20)
    let first = createTest('a')
    tracker.open(first.context)
    runtime.hit('b')
    runtime.hit('a')
    let child = createTest('a > child')
    tracker.open(child.context)
    runtime.hit('c')
    child.end()
    at(25)
    first.end()
    first.state.passed = false
    first.state.error = {
      failureType: 'subtestsFailed',
      message: '1 subtest failed',
    }
    runtime.hit('gap')
    at(30)
    let second = createTest('b')
    tracker.open(second.context)
    at(32)
    second.end()
    at(40)
    tracker.exit(0, inputs)

    expect(records).toStrictEqual([
      { kind: 'loaded' },
      { occurrence: 0, kind: 'open', name: 'a', seq: 0 },
      { kind: 'close', seq: 0 },
      {
        message: '1 subtest failed',
        covers: ['a', 'b', 'c'],
        unfinished: false,
        timedOut: false,
        reached: false,
        occurrence: 0,
        failed: true,
        duration: 5,
        kind: 'try',
        name: 'a',
        hits: 3,
        seq: 0,
      },
      { occurrence: 0, kind: 'open', name: 'b', seq: 1 },
      { kind: 'close', seq: 1 },
      {
        unfinished: false,
        timedOut: false,
        reached: false,
        message: null,
        occurrence: 0,
        failed: false,
        duration: 2,
        kind: 'try',
        covers: [],
        name: 'b',
        hits: 0,
        seq: 1,
      },
      {
        ...inputs,
        covers: ['gap', 'load'],
        concurrent: false,
        loadDuration: 10,
        hookDuration: 13,
        reached: false,
        duration: 30,
        kind: 'end',
        total: 5,
        hits: 2,
        code: 0,
      },
    ])
  })

  it('gives sites of overlapping tries to each and counts duplicate names', () => {
    let { tracker, records, runtime } = setup()
    let first = createTest('suite > a')
    let second = createTest('suite > a')
    tracker.open(first.context)
    tracker.open(second.context)
    runtime.hit('both')
    first.end()
    runtime.hit('second')
    second.end()
    tracker.exit(1, inputs)

    expect(
      pick(records, 'try').map(entry => [entry.occurrence, entry.covers]),
    ).toStrictEqual([
      [0, ['both']],
      [1, ['both', 'second']],
    ])
    expect(pick(records, 'end')[0]).toMatchObject({
      concurrent: true,
      covers: [],
      hits: 0,
      code: 1,
    })
  })

  it('reads timeouts and messages of failed tries', () => {
    let { tracker, records } = setup()
    runTest(tracker, 'timeout', {
      error: {
        cause: new Error('test timed out after 30ms'),
        failureType: 'testTimeoutFailure',
      },
      passed: false,
    })
    runTest(tracker, 'thrown', { error: 'plain', passed: false })
    tracker.exit(1, inputs)

    expect(
      pick(records, 'try').map(entry => [entry.timedOut, entry.message]),
    ).toStrictEqual([
      [true, 'test timed out after 30ms'],
      [false, 'plain'],
    ])
  })

  it('records errors with the tries they came in and load errors', () => {
    let { tracker, records, runtime } = setup()
    tracker.error(new Error('setup'))
    let test = createTest('a')
    tracker.open(test.context)
    runtime.hit('a')
    tracker.error(new Error('inside'))
    test.end()
    tracker.loaded()
    tracker.error(new Error('after'))

    expect(pick(records, 'error')).toStrictEqual([
      { message: 'setup', kind: 'error', load: true, tries: [], hits: 0 },
      { message: 'inside', kind: 'error', load: false, tries: [0], hits: 1 },
      { message: 'after', kind: 'error', load: false, tries: [], hits: 1 },
    ])
  })

  it('keeps the mutant active and stops starting tests after a kill', () => {
    let { tracker, records, runtime } = setup({
      mode: 'isolated',
      hitLimit: 100,
      mutant: 'm1',
      bail: true,
    })

    expect(runtime).toMatchObject({
      coverage: null,
      hitLimit: 100,
      active: 'm1',
    })

    let passed = createTest('passed')
    tracker.open(passed.context)
    runtime.hit('m1')
    passed.end()
    runTest(tracker, 'failed', {
      error: new Error('expected 1'),
      passed: false,
    })
    let skipped = createTest('skipped')

    expect(() => {
      tracker.open(skipped.context)
    }).toThrow(expect.objectContaining({ name: 'MootantBailError' }))

    tracker.exit(1, inputs)

    expect(pick(records, 'bail')).toStrictEqual([{ kind: 'bail', seq: 1 }])

    expect(pick(records, 'open').map(entry => entry.name)).toStrictEqual([
      'passed',
      'failed',
    ])
    expect(
      pick(records, 'try').map(entry => [
        entry.name,
        entry.failed,
        entry.reached,
        entry.covers,
      ]),
    ).toStrictEqual([
      ['passed', false, true, null],
      ['failed', true, true, null],
    ])
    expect(pick(records, 'end')[0]).toMatchObject({
      reached: true,
      covers: null,
    })
  })

  it('never stops for expected failures or failures before the reach', () => {
    let { tracker, records, runtime } = setup({
      expected: [{ occurrence: 0, name: 'todo' }],
      mode: 'isolated',
      mutant: 'm1',
      bail: true,
    })
    runTest(tracker, 'early', { passed: false })
    runtime.hit('m1')
    runTest(tracker, 'todo', { passed: false })
    runTest(tracker, 'last')
    tracker.exit(0, inputs)

    expect(
      pick(records, 'try').map(entry => [entry.name, entry.failed]),
    ).toStrictEqual([
      ['early', true],
      ['todo', false],
      ['last', false],
    ])
  })

  it('never fails nor stops for todo tests the reporter passed', () => {
    let { tracker, records, runtime } = setup({
      mode: 'isolated',
      mutant: 'm1',
      bail: true,
    })
    runtime.hit('m1')
    let error = new Error('todo')
    tracker.todo(undefined)
    tracker.todo(error)
    runTest(tracker, 'own', { passed: false, error })
    runTest(tracker, 'unset', { error: undefined, passed: false })
    tracker.exit(1, inputs)

    expect(
      pick(records, 'try').map(entry => [entry.name, entry.failed]),
    ).toStrictEqual([
      ['own', false],
      ['unset', true],
    ])
    expect(pick(records, 'bail')).toStrictEqual([{ kind: 'bail', seq: 1 }])
  })

  it('marks tries that the reporter passes as todo after they were recorded', () => {
    let { tracker, records, runtime } = setup({
      mode: 'isolated',
      mutant: 'm1',
      bail: true,
    })
    runtime.hit('m1')
    let error = new Error('todo')
    runTest(tracker, 'late', { passed: false, error })
    let skipped = createTest('skipped')

    expect(() => {
      tracker.open(skipped.context)
    }).toThrow(expect.objectContaining({ name: 'MootantBailError' }))

    tracker.exit(1, inputs)
    tracker.todo(new Error('other'))
    tracker.todo(error)
    tracker.todo(error)

    expect(pick(records, 'bail')).toStrictEqual([{ kind: 'bail', seq: 0 }])
    expect(pick(records, 'todo-try')).toStrictEqual([
      { kind: 'todo-try', seq: 0 },
    ])
  })

  it('marks uncaught errors that node:test gave to a todo test', () => {
    let { tracker, records } = setup({ mode: 'isolated', mutant: 'm1' })
    let cause = new Error('late')
    let test = createTest('todo')
    tracker.open(test.context)
    tracker.error(new Error('other'))
    tracker.error(cause)
    tracker.error(undefined)
    test.end()
    tracker.exit(0, inputs)
    tracker.todo('primitive')
    tracker.todo(new Error('no cause'))
    tracker.todo(new Error('wrapped', { cause }))

    expect(pick(records, 'todo-error')).toStrictEqual([
      { kind: 'todo-error', error: 1 },
    ])
  })

  it('runs every test without bail', () => {
    let { tracker, records, runtime } = setup({
      mode: 'isolated',
      mutant: 'm1',
    })
    let failed = createTest('failed')
    failed.state.passed = false
    tracker.open(failed.context)
    runtime.hit('m1')
    failed.end()
    runTest(tracker, 'next')
    tracker.exit(1, inputs)

    expect(pick(records, 'try').map(entry => entry.name)).toStrictEqual([
      'failed',
      'next',
    ])
  })

  it('records a try that runs at the exit as unfinished', () => {
    let { tracker, records, runtime, at } = setup()
    at(15)
    let test = createTest('exits')
    test.state.passed = false
    tracker.open(test.context)
    runtime.hit('a')
    at(22)
    tracker.exit(0, inputs)

    expect(pick(records, 'try')[0]).toMatchObject({
      unfinished: true,
      covers: ['a'],
      failed: false,
      message: null,
      duration: 7,
      hits: 1,
    })
    expect(pick(records, 'end')[0]).toMatchObject({
      loadDuration: 5,
      hookDuration: 0,
      duration: 12,
      hits: 0,
    })
  })

  it('counts the whole process as loading without tries', () => {
    let { tracker, records, runtime, at } = setup()
    runtime.hit('load')
    at(18)
    tracker.exit(1, inputs)

    expect(pick(records, 'end')[0]).toMatchObject({
      covers: ['load'],
      loadDuration: 8,
      hookDuration: 0,
      hits: 1,
    })
  })
})
