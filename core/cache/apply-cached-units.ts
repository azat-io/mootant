import type { RunState } from '../../types/run/run-state'

import { decideEvidence } from '../run/decide-evidence'

/**
 * Applies cached isolated evidence before the isolated rounds, by the rule of
 * fresh units (`decideEvidence`): for every undecided mutant on the isolated
 * path, a valid cached kill in one of its test files is that file's evidence,
 * and a valid cached reached pass counts as `Survived` evidence; either takes
 * its test file off the list. The cache never holds a timeout or an error, so a
 * file before the first cached kill without a valid entry still runs, and the
 * kill decides only if that file brings no kill or timeout of its own; files
 * after the first cached kill can no longer decide and are dropped. A mutant
 * left with nothing to run that never ran is `cached`.
 *
 * @param state - State of the run with its cache, updated in place.
 */
export function applyCachedUnits(state: RunState): void {
  let { cache } = state
  if (cache === null) {
    return
  }
  for (let mutant of state.mutants.values()) {
    if (
      mutant.path !== 'isolated' ||
      mutant.verdict !== null ||
      mutant.files.length === 0
    ) {
      continue
    }
    let remaining: string[] = []
    for (let file of mutant.files) {
      let found = cache.lookupUnit(mutant, file)
      if (found === 'survived') {
        mutant.survived = true
        mutant.evidence.set(file, 'none')
      } else if (found === null) {
        remaining.push(file)
      } else {
        mutant.evidence.set(file, found)
        break
      }
    }
    mutant.files = remaining
    mutant.verdict = decideEvidence(mutant)?.verdict ?? null
    if (mutant.files.length === 0 && mutant.tries === 0) {
      mutant.cached = true
    }
  }
}
