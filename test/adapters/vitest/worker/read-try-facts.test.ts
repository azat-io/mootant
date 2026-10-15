import type { RunnerTestCase } from 'vitest'

import { describe, expect, it } from 'vitest'

import type { MutantRuntime } from '../../../../types/adapter/mutant-runtime'

import { readTryFacts } from '../../../../adapters/vitest/worker/read-try-facts'

/**
 * Builds a test whose try ended.
 *
 * @param result - Result of the test after the try, as Vitest left it.
 * @param fails - Whether the test is expected to fail.
 * @returns Test with the given result.
 */
function createTest(
  result: RunnerTestCase['result'],
  fails?: boolean,
): RunnerTestCase {
  return { id: 't', result, fails } as RunnerTestCase
}

let runtime = { reached: true, active: 'm' } as MutantRuntime

let observed = {
  timedOut: false,
  state: 'pass',
  covers: ['a'],
  duration: 3,
  errors: [],
  strays: [],
  hits: 2,
}

describe('readTryFacts', () => {
  it('reads a passed try', () => {
    expect(
      readTryFacts(createTest({ state: 'run' }), runtime, observed),
    ).toStrictEqual({
      timedOut: false,
      skipped: false,
      reached: true,
      covers: ['a'],
      failed: false,
      message: null,
      duration: 3,
      mutant: 'm',
      strays: [],
      test: 't',
      hits: 2,
    })
  })

  it('fails a try on the errors it added, teardown errors included', () => {
    let test = createTest({ state: 'run' })

    expect(
      readTryFacts(test, runtime, {
        ...observed,
        errors: [{ message: 'expected 1\nto be 2' }, { message: 'other' }],
      }),
    ).toMatchObject({ message: 'expected 1', timedOut: false, failed: true })
    expect(
      readTryFacts(test, runtime, { ...observed, state: 'fail' }),
    ).toMatchObject({ message: null, failed: true })
  })

  it('reads expected failures after the flip of the test runner', () => {
    expect(
      readTryFacts(createTest({ state: 'run' }, true), runtime, {
        ...observed,
        errors: [{ message: 'Expect test to fail' }],
      }),
    ).toMatchObject({ failed: true })
    expect(
      readTryFacts(createTest({ state: 'run' }, true), runtime, {
        ...observed,
        state: 'fail',
      }),
    ).toMatchObject({ failed: false })
  })

  it('reads skips from the state after hooks or the replaced result', () => {
    expect(
      readTryFacts(createTest({ state: 'run' }), runtime, {
        ...observed,
        state: 'skip',
      }),
    ).toMatchObject({ skipped: true, failed: false })
    expect(
      readTryFacts(createTest({ state: 'skip' }), runtime, {
        ...observed,
        errors: [{ message: 'lost' }],
        state: undefined,
      }),
    ).toMatchObject({ skipped: true, failed: false })
    expect(
      readTryFacts(createTest(undefined), runtime, {
        ...observed,
        state: undefined,
      }),
    ).toMatchObject({ skipped: false, failed: false })
  })

  it("reads mootant's and the test runner's timeouts", () => {
    expect(
      readTryFacts(createTest({ state: 'run' }), runtime, {
        ...observed,
        timedOut: true,
      }),
    ).toMatchObject({ timedOut: true })
    for (let message of [
      'Test timed out in 5000ms.',
      'Hook timed out in 10000ms.',
      'The teardown phase of "aroundEach" hook timed out after 10ms.',
    ]) {
      expect(
        readTryFacts(createTest({ state: 'run' }), runtime, {
          ...observed,
          errors: [{ message }],
        }),
      ).toMatchObject({ timedOut: true, failed: true })
    }
  })
})
