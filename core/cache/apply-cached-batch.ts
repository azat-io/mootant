import type { RunState } from '../../types/run/run-state'

import { getTestFileKey } from '../run/get-test-file-key'

/**
 * Applies cached evidence to the mutants on the batch path before the batch
 * phases of fast mode. Isolated evidence comes first, since it is what the
 * default mode trusts: a valid cached kill in a covering test file decides the
 * mutant on the isolated path, and so do valid cached reached passes in all of
 * them, as `Survived`. Otherwise a valid cached batch kill by a covering test
 * decides it on the batch path. Decided mutants are `cached` and take no batch
 * try; the others run as usual.
 *
 * @param state - State of the run with its cache, updated in place.
 */
export function applyCachedBatch(state: RunState): void {
  let { analysis, cache } = state
  if (cache === null) {
    return
  }
  for (let mutant of state.mutants.values()) {
    if (mutant.path !== 'batch' || mutant.verdict !== null) {
      continue
    }
    let files = new Set(
      mutant.coveredBy.map(test => getTestFileKey(analysis.tests.get(test)!)),
    )
    let survived = 0
    for (let file of files) {
      let found = cache.lookupUnit(mutant, file)
      if (found === 'survived') {
        survived += 1
      } else if (found !== null) {
        mutant.verdict = found
        break
      }
    }
    if (mutant.verdict === null && survived === files.size) {
      mutant.survived = true
    }
    if (mutant.verdict !== null || mutant.survived) {
      mutant.path = 'isolated'
    } else {
      for (let test of mutant.coveredBy) {
        mutant.verdict = cache.lookupBatch(mutant, test)
        if (mutant.verdict !== null) {
          break
        }
      }
    }
    if (mutant.verdict !== null || mutant.survived) {
      mutant.cached = true
      mutant.queue = []
    }
  }
}
