import type { IsolatedRequest, RunState } from '../../types/run/run-state'
import type { IsolatedPlan } from '../../types/adapter/isolated-plan'

import { getTestFileLimits } from './get-test-file-limits'

/**
 * Plans one isolated run: a unit per request on its whole test file, with
 * limits that add up the work outside tries (loading the file and its suite
 * hooks) and one try of every test of the file. Units that confirm a timeout
 * get doubled time, and one that confirms a hit-limit timeout `factor × floor`
 * more site evaluations, the same room for any test, as the time a test took,
 * its hooks and waits included, does not tell how fast it evaluates sites.
 *
 * @param state - State of the run.
 * @param requests - Mutants and test files to run, in order.
 * @returns Units in request order.
 */
export function planIsolated(
  state: RunState,
  requests: readonly IsolatedRequest[],
): IsolatedPlan {
  let { analysis, limits } = state
  return {
    units: requests.map(request => {
      let total = getTestFileLimits(
        state,
        request.file,
        request.confirming ? 2 : 1,
      )
      if (request.raised) {
        total.hitLimit += limits.hitLimit.factor * limits.hitLimit.floor
      }
      let { project, file } = analysis.testFiles.get(request.file)!
      return { mutant: request.mutant, limits: total, project, file }
    }),
  }
}
