import type { TryLimits } from '../../types/adapter/try-limits'
import type { RunState } from '../../types/run/run-state'

import { getTryLimits } from './get-try-limits'

/**
 * Computes the limits of running a whole test file with a mutant, as an
 * isolated unit does: those of loading the file and its suite hooks and of one
 * try of every test of the file, added up.
 *
 * @param state - State of the run.
 * @param file - Key of the test file (`getTestFileKey`).
 * @param scale - 1, or 2 to confirm a timeout.
 * @returns Hit limit and timeout of the whole file.
 */
export function getTestFileLimits(
  state: RunState,
  file: string,
  scale: number,
): TryLimits {
  let { analysis, limits } = state
  let total = getTryLimits(
    analysis.loads.get(file) ?? { duration: 0, hits: 0 },
    limits,
    scale,
  )
  let tests = analysis.fileTests.get(file)
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
  return total
}
