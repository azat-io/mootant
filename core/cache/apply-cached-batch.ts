import type { MutantVerdict, MutantState } from '../../types/run/mutant-state'
import type { RunCache } from '../../types/cache/run-cache'
import type { RunState } from '../../types/run/run-state'

import { rankMutantFiles } from '../run/rank-mutant-files'
import { getTestFileKey } from '../run/get-test-file-key'
import { compareCodeUnits } from '../compare-code-units'
import { decideEvidence } from '../run/decide-evidence'

/**
 * Applies cached evidence to the mutants on the batch path before the batch
 * phases of fast mode. Isolated evidence comes first, since it is what the
 * default mode trusts, and it decides by the rule of the isolated path
 * (`decideEvidence`) over the test files it would run in (`rankMutantFiles`): a
 * valid cached kill in one of them decides the mutant on the isolated path when
 * every file before it has a valid cached reached pass, and valid cached
 * reached passes in all of them decide it as `Survived`. Otherwise a valid
 * cached batch kill by a covering test decides it on the batch path when every
 * covering test the batch phases try before it (`getBatchOrder`) has a valid
 * cached pass, so a test whose entry is gone, such as one that now runs out of
 * time, runs first as in a fresh run. A kill by the test its run tried first
 * (`CacheEntry.first`) decides it even then: phase 1 tries that test alone, so
 * the kill follows no pass, and the cheapest covering test, which comes first,
 * may change between runs with the measured durations. Decided mutants are
 * `cached` and take no batch try; the others run as usual.
 *
 * @param state - State of the run with its cache, updated in place.
 */
export function applyCachedBatch(state: RunState): void {
  let { cache } = state
  if (cache === null) {
    return
  }
  for (let mutant of state.mutants.values()) {
    if (mutant.path !== 'batch' || mutant.verdict !== null) {
      continue
    }
    let ranked = rankMutantFiles(state, mutant)
    let evidence = readCachedUnits(cache, mutant, ranked)
    let decided = decideEvidence({ evidence, ranked })
    if (decided === null) {
      mutant.verdict = findCachedBatchKill(state, cache, mutant)
    } else {
      mutant.path = 'isolated'
      mutant.verdict = decided.verdict
      mutant.survived = decided.verdict === null
      mutant.ranked = ranked
      mutant.evidence = evidence
    }
    if (mutant.verdict !== null || mutant.survived) {
      mutant.cached = true
      mutant.queue = []
    }
  }
}

/**
 * Lists the covering tests of a mutant in the order the batch phases apply
 * their tries (`runBatchPhases`, `planBatch`): the cheapest in phase 1, then
 * the others of phase 2 by test file key and file order.
 *
 * @param state - State of the run.
 * @param mutant - Mutant on the batch path.
 * @returns Ids of its covering tests.
 */
function getBatchOrder(state: RunState, mutant: MutantState): string[] {
  let { analysis } = state
  let [first, ...rest] = mutant.coveredBy
  let keys = new Map(
    rest.map(test => [test, getTestFileKey(analysis.tests.get(test)!)]),
  )
  return [
    first!,
    ...rest.toSorted(
      (left, right) =>
        compareCodeUnits(keys.get(left)!, keys.get(right)!) ||
        analysis.order.get(left)! - analysis.order.get(right)!,
    ),
  ]
}

/**
 * Reads the valid cached isolated evidence of a mutant in the order of its test
 * files, up to the first file without a valid entry or with a kill, since the
 * files after it cannot change the verdict (`decideEvidence`). A cached reached
 * pass is a file done without a kill.
 *
 * @param cache - Cache of the run; each lookup marks its entry as used.
 * @param mutant - Mutant on the batch path.
 * @param ranked - Keys of its test files, the likeliest to kill it first.
 * @returns Isolated evidence by key of the test file.
 */
function readCachedUnits(
  cache: RunCache,
  mutant: MutantState,
  ranked: readonly string[],
): MutantState['evidence'] {
  let evidence: MutantState['evidence'] = new Map()
  for (let file of ranked) {
    let found = cache.lookupUnit(mutant, file)
    if (found === null) {
      break
    }
    evidence.set(file, found === 'survived' ? 'none' : found)
    if (found !== 'survived') {
      break
    }
  }
  return evidence
}

/**
 * Finds the valid cached batch kill that decides a mutant: one by a covering
 * test after valid cached passes of every covering test the batch phases try
 * before it (`getBatchOrder`), or one by the test its run tried first
 * (`CacheEntry.first`). Lookups stop at that kill.
 *
 * @param state - State of the run.
 * @param cache - Cache of the run; each lookup marks its entry as used.
 * @param mutant - Mutant on the batch path that its isolated evidence leaves
 *   undecided.
 * @returns The kill, or null when no cached batch evidence decides the mutant.
 */
function findCachedBatchKill(
  state: RunState,
  cache: RunCache,
  mutant: MutantState,
): MutantVerdict | null {
  let passed = true
  for (let test of getBatchOrder(state, mutant)) {
    let found = cache.lookupBatch(mutant, test)
    if (found === null) {
      passed = false
    } else if (found !== 'survived' && (passed || found.first)) {
      return found.verdict
    }
  }
  return null
}
