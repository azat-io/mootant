import type {
  BatchPlan,
  BatchUnit,
  BatchTest,
} from '../../types/adapter/batch-plan'
import type { PlannedTry, RunState } from '../../types/run/run-state'

import { getTestFileLimits } from './get-test-file-limits'
import { compareCodeUnits } from '../compare-code-units'
import { getTestFileKey } from './get-test-file-key'
import { getTryLimits } from './get-try-limits'

/**
 * Planned tests of one test file before they become a unit.
 */
interface FileWork {
  /**
   * Planned tests in file order with the ids of their mutants.
   */
  tests: { mutants: string[]; id: string }[]

  /**
   * Key of the test file (`getTestFileKey`).
   */
  key: string
}

/**
 * Plans one batch run: groups the tries by test file and test, in file order,
 * with limits from the dry run, one unit per test file. The adapter never runs
 * two units of one test file at once, as a plain run of the test runner never
 * runs a test file twice at once, so splitting a file would only load it more
 * often. A run that confirms timeouts gives each test twice the time limit of
 * its whole test file (`getTestFileLimits`), as an isolated unit that confirms
 * a timeout has: a test slowed past its own limit may still fit in the time of
 * its file and pass there. It also gets half the workers, so the tries compete
 * less for the processor.
 *
 * @param state - State of the run.
 * @param tries - Mutants to try in tests.
 * @param scale - 1, or 2 to confirm timeouts.
 * @returns Units sorted by test file, and the workers the run may use.
 */
export function planBatch(
  state: RunState,
  tries: readonly PlannedTry[],
  scale: number,
): BatchPlan {
  let { analysis } = state
  let files = new Map<string, Map<string, string[]>>()
  for (let { mutant, test } of tries) {
    let key = getTestFileKey(analysis.tests.get(test)!)
    let tests = files.get(key) ?? new Map<string, string[]>()
    files.set(key, tests)
    let mutants = tests.get(test) ?? []
    tests.set(test, mutants)
    if (!mutants.includes(mutant)) {
      mutants.push(mutant)
    }
  }
  let units = [...files]
    .toSorted(([left], [right]) => compareCodeUnits(left, right))
    .map(([key, tests]) => {
      let ordered = [...tests]
        .map(([id, mutants]) => ({ mutants, id }))
        .toSorted(
          (left, right) =>
            analysis.order.get(left.id)! - analysis.order.get(right.id)!,
        )
      return createUnit(state, { tests: ordered, key }, scale)
    })
  let workers =
    scale > 1 ? Math.max(1, Math.floor(state.workers / 2)) : state.workers
  return { concurrency: workers, units }
}

/**
 * Builds a batch unit with the limits of its tests and of the work outside
 * tries: loading the file and its suite hooks; to confirm timeouts, a planned
 * test has the time limit of the whole file instead of its own. The unit budget
 * covers that work, every try and control of the planned tests, and one try of
 * each unplanned test before the last planned one.
 *
 * @param state - State of the run.
 * @param work - Key of the test file and its planned tests in file order.
 * @param scale - 1, or 2 to confirm timeouts.
 * @returns Unit of the plan.
 */
function createUnit(state: RunState, work: FileWork, scale: number): BatchUnit {
  let { analysis, limits } = state
  let { tests: planned, key } = work
  let load = getTryLimits(
    analysis.loads.get(key) ?? { duration: 0, hits: 0 },
    limits,
    scale,
  )
  let fileLimits = scale > 1 ? getTestFileLimits(state, key, scale) : null
  let tests: BatchTest[] = planned.map(test => {
    let own = getTryLimits(analysis.baselines.get(test.id)!, limits, scale)
    return {
      timeout: fileLimits?.timeout ?? own.timeout,
      hitLimit: own.hitLimit,
      mutants: test.mutants,
      id: test.id,
    }
  })
  let siblings = analysis.fileTests.get(key)!
  let last = siblings.indexOf(planned.at(-1)!.id)
  let total = load.timeout
  let running = siblings.slice(0, last + 1)
  for (let id of running) {
    let test = tests.find(entry => entry.id === id)
    total +=
      test === undefined ?
        getTryLimits(analysis.baselines.get(id)!, limits, scale).timeout
      : test.timeout * (2 * test.mutants.length + 1)
  }
  let { project, file } = analysis.testFiles.get(key)!
  return { limits: { total, load }, project, tests, file }
}
