import type { MutantResult } from '../../types/run/mutant-result'
import type { RunState } from '../../types/run/run-state'
import type { Mutant } from '../../types/mutant/mutant'

/**
 * Decides the status of every mutant from its evidence: ignored mutants, which
 * have no state, are `Ignored`; a kill, a confirmed timeout or an error
 * decides; otherwise a reached pass makes it `Survived` and nothing makes it
 * `NoCoverage`.
 *
 * @param state - State of the run after the batch and isolated phases.
 * @param mutants - Every mutant of the run, pending and ignored, in file and
 *   canonical order.
 * @returns Verdicts in the order of the mutants.
 */
export function decideResults(
  state: RunState,
  mutants: readonly Mutant[],
): MutantResult[] {
  return mutants.map(mutant => {
    let found = state.mutants.get(mutant.id)
    if (found === undefined) {
      return {
        isolatedBecause: null,
        status: 'Ignored',
        killedBy: null,
        killedIn: null,
        coveredBy: [],
        cached: false,
        message: null,
        duration: 0,
        cause: null,
        path: null,
        tries: 0,
        mutant,
      }
    }
    let { verdict } = found
    return {
      status: verdict?.status ?? (found.survived ? 'Survived' : 'NoCoverage'),
      isolatedBecause: found.isolatedBecause,
      message: verdict?.message ?? null,
      killedIn: verdict?.file ?? null,
      killedBy: verdict?.test ?? null,
      cause: verdict?.cause ?? null,
      coveredBy: found.coveredBy,
      duration: found.duration,
      cached: found.cached,
      tries: found.tries,
      path: found.path,
      mutant,
    }
  })
}
