import type {
  IsolatedUnit,
  IsolatedPlan,
} from '../../types/adapter/isolated-plan'
import type { IsolatedRequest, RunState } from '../../types/run/run-state'
import type { IsolatedResult } from '../../types/adapter/isolated-result'
import type { MutantState } from '../../types/run/mutant-state'

import { readIsolatedUnit } from './read-isolated-unit'
import { getUnitEvidence } from './get-unit-evidence'
import { getDisplayPath } from './get-display-path'
import { decideEvidence } from './decide-evidence'

/**
 * Message of a mutant whose units went missing twice.
 */
const UNREPORTED = 'The test runner did not report this mutant.'

/**
 * Records what an isolated run reported, unit by unit. A unit is a timeout when
 * it exceeded its hit limit; a hang, or a test or suite hook that ran out of
 * time after the mutant was reached, waits for a confirmation with doubled
 * bounds, or is final when the unit was one; a crash, a load error, a failed
 * suite hook or file teardown in a unit that reached the mutant, or a test that
 * failed or threw a stray error after the mutant was reached kills; a unit that
 * reached the mutant and passed is survived evidence. The dry run had no failed
 * suite hook, since one fails the dry run. Stray errors of tests and test files
 * that had them in the dry run prove nothing. A unit without facts is planned
 * once more, then gives an `Error` verdict unless another file has evidence.
 * The verdict of a mutant follows `decideEvidence`: the kill or timeout of its
 * first test file in the order of `routeIsolated` that has one, once every file
 * before it is done; a timeout waiting for its confirmation or a unit waiting
 * for its retry holds back the evidence of later files, so the verdict does not
 * depend on which files ran together. Kills and reached passes go to the cache
 * of the run, which keeps only what it may reuse. The cost of a unit counts the
 * start of its process too.
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
  let missing: IsolatedRequest[] = []
  let touched = new Set<MutantState>()
  for (let [index, unit] of plan.units.entries()) {
    let request = requests[index]!
    let mutant = state.mutants.get(unit.mutant)!
    let found = facts.get(index)
    if (found === undefined) {
      missing.push(request)
      continue
    }
    mutant.units += 1
    mutant.tries += 1
    mutant.duration += found.duration
    mutant.unitDuration += found.duration + (found.startup ?? 0)
    if (found.incomplete === 'hang') {
      reportHang(state, unit)
    }
    touched.add(mutant)
    let verdict = readIsolatedUnit(state, mutant, {
      facts: found,
      request,
      unit,
    })
    if (verdict !== null) {
      state.cache?.recordUnit(mutant, request.file, {
        inputs: found.inputs,
        verdict,
      })
    }
    let evidence = getUnitEvidence(verdict, request)
    mutant.survived ||= verdict === 'survived'
    mutant.evidence.set(request.file, evidence)
    if (evidence === 'confirming') {
      next.push({ ...request, confirming: true, retried: false })
    }
  }
  for (let mutant of touched) {
    settleMutant(mutant)
  }
  for (let request of missing) {
    let mutant = state.mutants.get(request.mutant)!
    if (mutant.verdict !== null) {
      continue
    }
    if (request.retried) {
      mutant.evidence.set(request.file, {
        message: UNREPORTED,
        status: 'Error',
        cause: null,
        file: null,
        test: null,
      })
      settleMutant(mutant)
    } else {
      if (!request.confirming) {
        mutant.evidence.set(request.file, 'retrying')
      }
      next.push({ ...request, retried: true })
    }
  }
  return next
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

/**
 * Gives an undecided mutant its verdict once its evidence decides it
 * (`decideEvidence`).
 *
 * @param mutant - State of the mutant, updated in place.
 */
function settleMutant(mutant: MutantState): void {
  let decided = decideEvidence(mutant)
  if (decided !== null) {
    mutant.verdict = decided.verdict
  }
}
