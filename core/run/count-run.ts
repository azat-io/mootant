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
 * @param work.survivors - Of the mutants of an isolated round, those that run
 *   with more test files; 0 when omitted.
 * @param work.confirming - Of the mutants of an isolated round, those that
 *   confirm a timeout; 0 when omitted.
 * @param work.retrying - Of the mutants of an isolated round, those that run
 *   again after a lost result; 0 when omitted.
 */
export function countRun(
  state: RunState,
  kind: Exclude<RunKind, 'dry'>,
  work: {
    confirming?: number
    survivors?: number
    retrying?: number
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
    confirming: work.confirming ?? 0,
    survivors: work.survivors ?? 0,
    retrying: work.retrying ?? 0,
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
