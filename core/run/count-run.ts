import type { RunState } from '../../types/run/run-state'
import type { RunKind } from '../../types/run/run-kind'

import { countVerdicts } from './count-verdicts'

/**
 * Counts one run of the test runner and reports its start with the number of
 * the run among the runs of its kind and the expected cost of its units. The
 * verdict counts are brought up to date first, as the result of the run before
 * was just recorded.
 *
 * @param state - State of the run, updated in place.
 * @param kind - What the run does, such as `batch` or `isolated`.
 * @param work - What the run tries.
 * @param work.mutants - Distinct mutants the run tries.
 * @param work.costs - Expected milliseconds of each unit in plan order.
 * @param work.chains - Serial chain of each unit in plan order.
 * @param work.workers - Units the run may execute at once.
 */
export function countRun(
  state: RunState,
  kind: Exclude<RunKind, 'dry'>,
  work: {
    chains: number[]
    workers: number
    costs: number[]
    mutants: number
  },
): void {
  countVerdicts(state)
  let round = (state.runs[kind] ?? 0) + 1
  state.runs[kind] = round
  state.report({
    units: work.costs.length,
    mutants: work.mutants,
    workers: work.workers,
    chains: work.chains,
    costs: work.costs,
    kind: 'run-start',
    run: kind,
    round,
  })
}
