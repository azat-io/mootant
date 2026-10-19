import type { MutantVerdict, MutantState } from '../../types/run/mutant-state'
import type { IsolatedRequest, RunState } from '../../types/run/run-state'
import type { IsolatedFacts } from '../../types/adapter/isolated-result'
import type { IsolatedUnit } from '../../types/adapter/isolated-plan'

import { classifyTry } from './classify-try'

/**
 * Reads the outcome of one isolated unit. A test counts as having reached the
 * mutant once it or an earlier test of the unit reached it, or, for a static
 * mutant, once the unit reached it anywhere.
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
  let firstFailed = facts.tests.find(test => test.failed || test.timedOut)
  let base = { test: firstFailed?.test ?? null, file: unit.file }
  if (facts.hits > unit.limits.hitLimit) {
    return {
      message: firstFailed?.message ?? null,
      cause: 'hit-limit',
      status: 'Timeout',
      ...base,
    }
  }
  if (facts.incomplete === 'hang') {
    return { status: 'Timeout', message: null, cause: 'hang', ...base }
  }
  if (facts.incomplete === 'crash') {
    return { status: 'Killed', cause: 'crash', message: null, ...base }
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
