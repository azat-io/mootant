import type { BatchUnit } from '../../types/adapter/batch-plan'
import type { RunState } from '../../types/run/run-state'

import { getTestFileKey } from './get-test-file-key'

/**
 * Estimates what a batch unit costs from the dry run: the time of its work
 * outside tries (loading and suite hooks), every try and control of its planned
 * tests, and one try of each unplanned test before the last planned one, the
 * work its budget covers. A unit that confirms timeouts likely runs out of time
 * again, so it costs its whole budget. The start of the process of the unit is
 * left out, as every unit pays it alike.
 *
 * @param state - State of the run.
 * @param unit - Unit of a batch plan, with at least one test.
 * @param scale - 1, or 2 for a unit that confirms timeouts.
 * @returns Milliseconds.
 */
export function getBatchUnitCost(
  state: RunState,
  unit: BatchUnit,
  scale: number,
): number {
  if (scale > 1) {
    return unit.limits.total
  }
  let { analysis } = state
  let key = getTestFileKey(analysis.tests.get(unit.tests[0]!.id)!)
  let siblings = analysis.fileTests.get(key)!
  let last = siblings.indexOf(unit.tests.at(-1)!.id)
  let cost = analysis.loads.get(key)?.duration ?? 0
  let running = siblings.slice(0, last + 1)
  for (let id of running) {
    let test = unit.tests.find(entry => entry.id === id)
    let tries = test === undefined ? 1 : 2 * test.mutants.length + 1
    cost += analysis.baselines.get(id)!.duration * tries
  }
  return cost
}
