import type { RunState } from '../../types/run/run-state'
import type { RunKind } from '../../types/run/run-kind'

/**
 * Counts one run of the test runner and reports its start with the number of
 * the run among the runs of its kind.
 *
 * @param state - State of the run, updated in place.
 * @param kind - What the run does, such as `batch` or `isolated`.
 * @param work - What the run tries.
 * @param work.mutants - Distinct mutants the run tries.
 * @param work.units - Units of the plan.
 */
export function countRun(
  state: RunState,
  kind: Exclude<RunKind, 'dry'>,
  work: { mutants: number; units: number },
): void {
  let round = (state.runs[kind] ?? 0) + 1
  state.runs[kind] = round
  state.report({
    mutants: work.mutants,
    units: work.units,
    kind: 'run-start',
    run: kind,
    round,
  })
}
