import type {
  IsolatedResult,
  IsolatedFacts,
} from '../../types/adapter/isolated-result'
import type {
  IsolatedUnit,
  IsolatedPlan,
} from '../../types/adapter/isolated-plan'
import type { MutantVerdict, MutantState } from '../../types/run/mutant-state'
import type { IsolatedRequest, RunState } from '../../types/run/run-state'

import { getDisplayPath } from './get-display-path'
import { classifyTry } from './classify-try'

/**
 * Message of a mutant whose units went missing twice.
 */
const UNREPORTED = 'The test runner did not report this mutant.'

/**
 * Records what an isolated run reported, unit by unit in plan order; the first
 * kill or confirmed timeout of a mutant wins. A unit is a timeout when it
 * exceeded its hit limit; a hang, or a test or suite hook that ran out of time
 * after the mutant was reached, waits for a confirmation with doubled bounds,
 * or is final when the unit was one; a crash, a load error, a failed suite hook
 * or worker teardown in a unit that reached the mutant, or a test that failed
 * or threw a stray error after the mutant was reached kills; a unit that
 * reached the mutant and passed is survived evidence. The dry run had no failed
 * suite hook, since one fails the dry run. Stray errors of tests and test files
 * that had them in the dry run prove nothing. A unit without facts is planned
 * once more, then the mutant gets an `Error` verdict.
 *
 * @param state - State of the run, updated in place.
 * @param planned - The plan the run executed and the requests it was built
 *   from, in the same order.
 * @param planned.plan - Plan of the run.
 * @param planned.requests - Mutants and files of the units.
 * @param result - What the adapter reported.
 * @returns Requests for the next isolated run: retries and confirmations.
 */
export function applyIsolatedResult(
  state: RunState,
  planned: { requests: readonly IsolatedRequest[]; plan: IsolatedPlan },
  result: IsolatedResult,
): IsolatedRequest[] {
  let { requests, plan } = planned
  let facts = new Map(result.units.map(unit => [unit.unit, unit]))
  let next: IsolatedRequest[] = []
  for (let [index, unit] of plan.units.entries()) {
    let request = requests[index]!
    let mutant = state.mutants.get(unit.mutant)!
    let found = facts.get(index)
    if (found === undefined) {
      if (mutant.verdict !== null) {
        continue
      }
      if (request.retried) {
        mutant.verdict = {
          message: UNREPORTED,
          status: 'Error',
          cause: null,
          file: null,
          test: null,
        }
      } else {
        next.push({ ...request, retried: true })
      }
      continue
    }
    mutant.units += 1
    mutant.tries += 1
    mutant.duration += found.duration
    mutant.unitDuration += found.duration
    if (found.incomplete === 'hang') {
      reportHang(state, unit)
    }
    if (mutant.verdict !== null) {
      continue
    }
    let verdict = readUnit(state, mutant, { facts: found, request, unit })
    if (verdict === 'survived') {
      mutant.survived = true
    } else if (
      verdict !== null &&
      verdict.status === 'Timeout' &&
      (verdict.cause === 'time-limit' || verdict.cause === 'hang') &&
      !request.confirming
    ) {
      next.push({ ...request, confirming: true, retried: false })
    } else if (verdict !== null) {
      mutant.verdict = verdict
    }
  }
  return next
}

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
function readUnit(
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

/**
 * Adds a `worker-hang` warning for an isolated unit whose worker the adapter
 * stopped.
 *
 * @param state - State of the run.
 * @param unit - Hung unit.
 */
function reportHang(state: RunState, unit: IsolatedUnit): void {
  let display = getDisplayPath(unit.file, state.root)
  state.diagnostics.push({
    message: `The worker running ${display} with mutant ${unit.mutant} stopped responding and was stopped.`,
    code: 'worker-hang',
    severity: 'warning',
    file: display,
    column: null,
    line: null,
  })
}
