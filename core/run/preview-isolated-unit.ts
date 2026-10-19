import type { UnitEnd } from '../../types/adapter/unit-end'
import type { RunState } from '../../types/run/run-state'

import { readIsolatedUnit } from './read-isolated-unit'
import { getUnitEvidence } from './get-unit-evidence'
import { countVerdicts } from './count-verdicts'

/**
 * Counts what a unit of the running isolated run brought as it ends, before the
 * run's result is recorded: its evidence goes on a copy of its mutant's, by the
 * rule of `applyIsolatedResult`, and the live verdict counts follow
 * (`countVerdicts`). A unit without facts, of a batch run or between runs
 * changes nothing, nor does any unit without live counts; the result of the run
 * still decides.
 *
 * @param state - State of the run, updated in place.
 * @param end - The unit that ended.
 */
export function previewIsolatedUnit(state: RunState, end: UnitEnd): void {
  let running = state.live?.running ?? null
  if (running === null || end.facts === undefined) {
    return
  }
  let { preview } = state.live!
  let unit = running.plan.units[end.unit]!
  let request = running.requests[end.unit]!
  let mutant = state.mutants.get(unit.mutant)!
  let verdict = readIsolatedUnit(state, mutant, {
    facts: end.facts,
    request,
    unit,
  })
  let copy = preview.get(unit.mutant) ?? {
    evidence: new Map(mutant.evidence),
    survived: mutant.survived,
  }
  copy.survived ||= verdict === 'survived'
  copy.evidence.set(request.file, getUnitEvidence(verdict, request))
  preview.set(unit.mutant, copy)
  countVerdicts(state, [mutant])
}
