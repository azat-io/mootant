import type { IsolatedRequest, RunState } from '../../types/run/run-state'
import type { IsolatedPlan } from '../../types/adapter/isolated-plan'

import { getTryLimits } from './get-try-limits'

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
      let scale = request.confirming ? 2 : 1
      let total = getTryLimits(
        analysis.loads.get(request.file) ?? { duration: 0, hits: 0 },
        limits,
        scale,
      )
      let tests = analysis.fileTests.get(request.file)
      if (tests !== undefined) {
        for (let test of tests) {
          let testLimits = getTryLimits(
            analysis.baselines.get(test)!,
            limits,
            scale,
          )
          total.hitLimit += testLimits.hitLimit
          total.timeout += testLimits.timeout
        }
      }
      if (request.raised) {
        total.hitLimit += limits.hitLimit.factor * limits.hitLimit.floor
      }
      let { project, file } = analysis.testFiles.get(request.file)!
      return { mutant: request.mutant, limits: total, project, file }
    }),
  }
}
