import type { MutantResult } from '../../types/run/mutant-result'
import type { RunStatus } from '../../types/run/run-status'
import type { RunState } from '../../types/run/run-state'
import type { Mutant } from '../../types/mutant/mutant'

import { orderCoveringTests } from './order-covering-tests'
import { rankMutantFiles } from './rank-mutant-files'
import { rankModuleFiles } from './rank-module-files'

/**
 * Decides the status of every mutant from its evidence: ignored mutants, which
 * have no state, are `Ignored`; a kill, a confirmed timeout or an error
 * decides; otherwise a reached pass makes it `Survived` and nothing makes it
 * `NoCoverage`. Each verdict lists the test files of the mutant the likeliest
 * to kill it first (`rankMutantFiles`) and its covering tests in that order
 * (`orderCoveringTests`), never by durations; a `NoCoverage` mutant without
 * test files lists the test files of its module to add a test to
 * (`rankModuleFiles`).
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
        testFiles: [],
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
    let status: RunStatus =
      verdict?.status ?? (found.survived ? 'Survived' : 'NoCoverage')
    let ranked = rankMutantFiles(state, found)
    let files =
      status === 'NoCoverage' && ranked.length === 0 ?
        rankModuleFiles(state, mutant.file)
      : ranked
    let testFiles = [
      ...new Set(files.map(key => state.analysis.testFiles.get(key)!.file)),
    ]
    return {
      coveredBy: orderCoveringTests(found.coveredBy, ranked, state.analysis),
      isolatedBecause: found.isolatedBecause,
      message: verdict?.message ?? null,
      killedIn: verdict?.file ?? null,
      killedBy: verdict?.test ?? null,
      cause: verdict?.cause ?? null,
      duration: found.duration,
      cached: found.cached,
      tries: found.tries,
      path: found.path,
      testFiles,
      mutant,
      status,
    }
  })
}
