import type { RunnerTestCase } from 'vitest'

import type { MutantRuntime } from '../../../types/adapter/mutant-runtime'
import type { TryFacts } from '../../../types/adapter/try-facts'

import { getErrorMessage } from '../../shared/get-error-message'
import { isTimeoutMessage } from './is-timeout-message'

/**
 * What the worker runner observed of a try besides the runtime's counters.
 */
interface TryObservation extends Pick<
  TryFacts,
  'timedOut' | 'duration' | 'strays' | 'covers' | 'hits'
> {
  /**
   * Errors the try added to the test's result: those of its body, its hooks,
   * its `aroundEach` teardown and fixture cleanup, after Vitest's "expected to
   * fail" flip.
   */
  errors: readonly unknown[]

  /**
   * State of the test right after its `afterEach` hooks, before the
   * `aroundEach` teardown.
   */
  state: undefined | string
}

/**
 * Reads the raw facts of a try once Vitest finished it, teardown included, from
 * the Vitest test and the mutant runtime. A try failed when it added an error,
 * or when its test, not marked `fails`, was failed after its hooks; for a test
 * marked `fails`, Vitest has already turned a failure into a pass by removing
 * its errors and a pass into a failure by adding one. A skip is read from the
 * state after the hooks or from the result Vitest replaces on a skip. Vitest's
 * own test and hook timeouts count as timed out.
 *
 * @param test - Test whose try ended.
 * @param runtime - Switch and counters the switched code updated.
 * @param observed - Errors and state of the try, its duration, hits, coverage,
 *   stray errors and mootant's timeout.
 * @returns Raw facts for `classifyTry`.
 */
export function readTryFacts(
  test: RunnerTestCase,
  runtime: MutantRuntime,
  observed: TryObservation,
): TryFacts {
  let { errors, state } = observed
  let skipped = state === 'skip' || test.result?.state === 'skip'
  let failed =
    !skipped && (errors.length > 0 || (test.fails !== true && state === 'fail'))
  let messages = errors.map(error => getErrorMessage(error))
  return {
    timedOut: observed.timedOut || messages.some(isTimeoutMessage),
    message: messages[0] ?? null,
    duration: observed.duration,
    reached: runtime.reached,
    covers: observed.covers,
    strays: observed.strays,
    mutant: runtime.active,
    hits: observed.hits,
    test: test.id,
    skipped,
    failed,
  }
}
