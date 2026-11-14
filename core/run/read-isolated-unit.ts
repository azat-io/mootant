import type { MutantVerdict, MutantState } from '../../types/run/mutant-state'
import type { IsolatedRequest, RunState } from '../../types/run/run-state'
import type { IsolatedFacts } from '../../types/adapter/isolated-result'
import type { IsolatedUnit } from '../../types/adapter/isolated-plan'

import { classifyTry } from './classify-try'

/**
 * Reads the outcome of one isolated unit. A test counts as having reached the
 * mutant once it or an earlier test of the unit reached it, or, for a static
 * mutant, once the unit reached it anywhere. A unit past its hit limit is a
 * timeout of the failed test with the most hits, the first of them on a tie:
 * that one ran into the limit, while a test that failed before it says nothing
 * of the overrun, and one after it throws at its first site, as the count of
 * the unit stays over the limit. With no failed test, the limit stopped the
 * load or a hook, whose error is the message. A hang names no test, as no
 * adapter reports the try that hung.
 *
 * @param state - State of the run.
 * @param mutant - State of the unit's mutant.
 * @param ran - The unit, its request and what the adapter reported.
 * @param ran.request - Mutant and test file key of the unit.
 * @param ran.unit - Unit of the plan.
 * @param ran.facts - Facts the adapter reported for it.
 * @returns Kill or timeout evidence, `survived` for a reached pass, or null
 *   when the unit decided nothing.
 */
export function readIsolatedUnit(
  state: RunState,
  mutant: MutantState,
  ran: { request: IsolatedRequest; facts: IsolatedFacts; unit: IsolatedUnit },
): MutantVerdict | 'survived' | null {
  let { request, facts, unit } = ran
  let { analysis } = state
  let failed = facts.tests.filter(test => test.failed || test.timedOut)
  let [firstFailed] = failed
  if (facts.hits > unit.limits.hitLimit) {
    let [stopped] = failed.toSorted((left, right) => right.hits - left.hits)
    return {
      message: stopped?.message ?? facts.loadError ?? facts.hookError,
      test: stopped?.test ?? null,
      cause: 'hit-limit',
      status: 'Timeout',
      file: unit.file,
    }
  }
  if (facts.incomplete === 'hang') {
    return {
      status: 'Timeout',
      file: unit.file,
      message: null,
      cause: 'hang',
      test: null,
    }
  }
  if (facts.incomplete === 'crash') {
    return {
      test: firstFailed?.test ?? null,
      status: 'Killed',
      file: unit.file,
      cause: 'crash',
      message: null,
    }
  }
  let reached = mutant.static && facts.reached
  for (let test of facts.tests) {
    reached ||= test.reached
    let strays = analysis.strayTests.has(test.test) ? [] : test.strays
    let { outcome, cause } = classifyTry(
      { ...test, reached, strays },
      unit.limits,
      'isolated',
    )
    if (outcome === 'killed' || outcome === 'timeout') {
      return {
        message: cause === 'stray-error' ? strays[0]! : test.message,
        status: outcome === 'killed' ? 'Killed' : 'Timeout',
        file: unit.file,
        test: test.test,
        cause,
      }
    }
  }
  if (facts.timedOut) {
    return facts.reached ?
        {
          message: facts.hookError,
          cause: 'time-limit',
          status: 'Timeout',
          file: unit.file,
          test: null,
        }
      : null
  }
  if (facts.loadError !== null) {
    return {
      message: facts.loadError,
      cause: 'load-error',
      status: 'Killed',
      file: unit.file,
      test: null,
    }
  }
  if (facts.reached && facts.hookError !== null) {
    return {
      message: facts.hookError,
      cause: 'hook-error',
      status: 'Killed',
      file: unit.file,
      test: null,
    }
  }
  if (
    facts.reached &&
    facts.strays.length > 0 &&
    !analysis.strayFiles.has(request.file)
  ) {
    return {
      message: facts.strays[0]!,
      cause: 'stray-error',
      status: 'Killed',
      file: unit.file,
      test: null,
    }
  }
  return facts.reached ? 'survived' : null
}
