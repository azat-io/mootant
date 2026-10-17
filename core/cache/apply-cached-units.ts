import type { RunState } from '../../types/run/run-state'

/**
 * Applies cached isolated evidence before the isolated rounds: for every
 * undecided mutant on the isolated path, a valid cached kill in one of its test
 * files decides it, and a valid cached reached pass counts as `Survived`
 * evidence and takes its test file off the list. Test files without valid
 * evidence stay and run as usual, so a mutant may reuse some files and run the
 * others. A mutant left with nothing to run that never ran is `cached`.
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
      } else if (found === null) {
        remaining.push(file)
      } else {
        mutant.verdict = found
        break
      }
    }
    mutant.files = mutant.verdict === null ? remaining : []
    if (mutant.files.length === 0 && mutant.tries === 0) {
      mutant.cached = true
    }
  }
}
