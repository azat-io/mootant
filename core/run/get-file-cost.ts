import type { RunState } from '../../types/run/run-state'

/**
 * Estimates what an isolated unit on a test file costs from the dry run: the
 * time of its work outside tries (loading and suite hooks) plus the dry
 * durations of all its tests, since each unit runs its whole file. The start of
 * the process of the unit is left out, as every unit pays it alike.
 *
 * @param state - State of the run.
 * @param file - Key of the test file (`getTestFileKey`).
 * @returns Milliseconds.
 */
export function getFileCost(state: RunState, file: string): number {
  let { analysis } = state
  let cost = analysis.loads.get(file)?.duration ?? 0
  let tests = analysis.fileTests.get(file)
  if (tests !== undefined) {
    for (let test of tests) {
      cost += analysis.baselines.get(test)!.duration
    }
  }
  return cost
}
