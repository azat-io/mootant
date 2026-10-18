import type { MutantVerdict, MutantState } from '../../types/run/mutant-state'

/**
 * Decides a mutant on the isolated path from its evidence by test file, the one
 * rule for fresh units and cached ones: the verdict is the kill or timeout of
 * its first test file in the order of `rankMutantFiles` that has one, once
 * every file before it is done without one. A file is not done while it waits
 * to run (it has no evidence), for a timeout confirmation or for a retry, so
 * the verdict depends neither on which files ran together nor on which came
 * from the cache. A file the test runner did not report gives its `Error` only
 * when no file has a kill or a timeout. Without any, the mutant is decided once
 * all its files are done, with no verdict: a reached pass makes it `Survived`.
 *
 * @param mutant - Test files of the mutant in order and their evidence.
 * @returns The verdict, or null while it is undecided.
 */
export function decideEvidence(
  mutant: Pick<MutantState, 'evidence' | 'ranked'>,
): { verdict: MutantVerdict | null } | null {
  let error: MutantVerdict | null = null
  for (let file of mutant.ranked) {
    let found = mutant.evidence.get(file)
    if (found === 'none') {
      continue
    }
    if (typeof found !== 'object') {
      return null
    }
    if (found.status !== 'Error') {
      return { verdict: found }
    }
    error ??= found
  }
  return { verdict: error }
}
