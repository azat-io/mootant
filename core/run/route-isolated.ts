import type { IsolatedReason } from '../../types/run/isolated-reason'
import type { RunState } from '../../types/run/run-state'

import { compareCodeUnits } from '../compare-code-units'
import { getTestFileKey } from './get-test-file-key'

/**
 * Sends a mutant to the isolated path and lists the test files it will run in,
 * cheapest first: the files of its covering tests and, for a static mutant, the
 * files that reached it while loading. Each unit runs its whole file, so the
 * cost of a file is the time of its work outside tries (loading and suite
 * hooks) plus the dry durations of all its tests. A mutant already on the
 * isolated path keeps its reason; batch tries waiting for a confirmation and
 * batch passes are dropped, since only the isolated units decide.
 *
 * @param state - State of the run.
 * @param id - Id of the mutant.
 * @param reason - Why it takes the isolated path, or null outside fast mode.
 */
export function routeIsolated(
  state: RunState,
  id: string,
  reason: IsolatedReason | null,
): void {
  let mutant = state.mutants.get(id)!
  if (mutant.path === 'isolated') {
    return
  }
  let { analysis } = state
  let files = new Set(analysis.loadCovers.get(id))
  for (let test of mutant.coveredBy) {
    files.add(getTestFileKey(analysis.tests.get(test)!))
  }
  let costs = new Map<string, number>()
  for (let file of files) {
    let cost = analysis.loads.get(file)?.duration ?? 0
    let tests = analysis.fileTests.get(file)
    if (tests !== undefined) {
      for (let test of tests) {
        cost += analysis.baselines.get(test)!.duration
      }
    }
    costs.set(file, cost)
  }
  mutant.path = 'isolated'
  mutant.isolatedBecause = reason
  mutant.survived = false
  mutant.confirm = []
  mutant.queue = []
  mutant.files = [...files].toSorted(
    (left, right) =>
      costs.get(left)! - costs.get(right)! || compareCodeUnits(left, right),
  )
}
