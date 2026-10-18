import type { RunState } from '../../types/run/run-state'

import { compareCodeUnits } from '../compare-code-units'

/**
 * Gives `Error` to every mutant the test runner evaluated outside its test
 * workers (`DryRunResult.outside`), such as in a global setup file, unless a
 * test killed it or timed out with it. The adapter cannot switch a mutant
 * there, so the code outside the workers always ran the original: a pass, or no
 * test reaching it, proves nothing. Each source file with such mutants gets one
 * `outside-workers` warning.
 *
 * @param state - State of the run after the batch and isolated phases, updated
 *   in place.
 * @param outside - Ids of the mutants evaluated outside the test workers.
 */
export function markOutsideMutants(
  state: RunState,
  outside: readonly string[],
): void {
  let counts = new Map<string, number>()
  for (let id of outside) {
    let mutant = state.mutants.get(id)
    if (mutant?.verdict !== null) {
      continue
    }
    let { file } = mutant.mutant
    mutant.verdict = {
      message: `The test runner ran this mutant's code outside its test workers, such as in a global setup file, where mootant cannot switch mutants.`,
      status: 'Error',
      cause: null,
      file: null,
      test: null,
    }
    counts.set(file, (counts.get(file) ?? 0) + 1)
  }
  for (let file of [...counts.keys()].toSorted(compareCodeUnits)) {
    let count = counts.get(file)!
    let mutants =
      count === 1 ?
        '1 mutant that no test killed ends'
      : `${count} mutants that no test killed end`
    state.diagnostics.push({
      message: `The test runner ran code of ${file} outside its test workers, such as in a global setup file, where mootant cannot switch mutants; ${mutants} with Error.`,
      code: 'outside-workers',
      severity: 'warning',
      column: null,
      line: null,
      file,
    })
  }
}
