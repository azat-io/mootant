import type { DryAnalysis } from '../../types/run/dry-analysis'
import type { Mutant } from '../../types/mutant/mutant'

/**
 * Lists the tests that reached any mutant of each module in the dry run, in all
 * or one of their tries. A static mutant, which a test file reached while
 * loading, ranks its test files by these (`rankMutantFiles`), since the tests
 * that reach it from a try are few or none. The mutants are all the dry run
 * hosted, selected or not, so the index is the same for any selection of
 * mutants (`--mutant`, `--since`).
 *
 * @param mutants - Pending mutants of the files of the run, selected or not.
 * @param analysis - Coverage of the dry run.
 * @returns Ids of the tests by the path of the module (`Mutant.file`).
 */
export function indexModuleTests(
  mutants: readonly Mutant[],
  analysis: DryAnalysis,
): Map<string, Set<string>> {
  let index = new Map<string, Set<string>>()
  for (let { file, id } of mutants) {
    let tests = index.get(file) ?? new Set<string>()
    index.set(file, tests)
    let reached = [analysis.stable.get(id), analysis.firstReach.get(id)]
    for (let found of reached) {
      if (found !== undefined) {
        for (let test of found) {
          tests.add(test)
        }
      }
    }
  }
  return index
}
