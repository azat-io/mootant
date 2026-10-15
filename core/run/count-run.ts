import type { RunState } from '../../types/run/run-state'
import type { RunKind } from '../../types/run/run-kind'

/**
 * Names of the run kinds in progress lines.
 */
const LABELS: Record<RunKind, string> = {
  confirmation: 'Confirmation run',
  recovery: 'Recovery run',
  isolated: 'Isolated run',
  batch: 'Batch run',
  dry: 'Dry run',
}

/**
 * Counts one run of the test runner and reports it as it starts, such as "Batch
 * run: 38 mutants in 4 units.".
 *
 * @param state - State of the run, updated in place.
 * @param kind - What the run does, such as `batch` or `isolated`.
 * @param work - What the run tries.
 * @param work.mutants - Distinct mutants the run tries.
 * @param work.units - Units of the plan.
 */
export function countRun(
  state: RunState,
  kind: RunKind,
  work: { mutants: number; units: number },
): void {
  state.runs[kind] = (state.runs[kind] ?? 0) + 1
  let mutants = work.mutants === 1 ? '1 mutant' : `${work.mutants} mutants`
  let units = work.units === 1 ? '1 unit' : `${work.units} units`
  state.progress(`${LABELS[kind]}: ${mutants} in ${units}.`)
}
