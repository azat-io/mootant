import type { IsolatedReason } from '../../types/run/isolated-reason'
import type { RunState } from '../../types/run/run-state'

import { rankMutantFiles } from './rank-mutant-files'

/**
 * Sends a mutant to the isolated path and lists the test files it will run in,
 * the likeliest to kill it first (`rankMutantFiles`). The first file with
 * evidence decides the verdict (`decideEvidence`). A mutant already on the
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
  mutant.path = 'isolated'
  mutant.isolatedBecause = reason
  mutant.survived = false
  mutant.confirm = []
  mutant.queue = []
  mutant.ranked = rankMutantFiles(state, mutant)
  mutant.files = [...mutant.ranked]
}
