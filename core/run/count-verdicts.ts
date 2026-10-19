import type { LiveVerdicts } from '../../types/run/live-verdicts'
import type { MutantState } from '../../types/run/mutant-state'
import type { RunStatus } from '../../types/run/run-status'
import type { RunState } from '../../types/run/run-state'

import { getFinalStatus } from './get-final-status'

/**
 * Count each counted status goes to.
 */
const COUNTS: Partial<Record<RunStatus, keyof LiveVerdicts['counts']>> = {
  Survived: 'survived',
  Timeout: 'timeout',
  Killed: 'killed',
  Error: 'error',
}

/**
 * Counts the final statuses of the given mutants, every mutant when omitted,
 * with the evidence the finished units of a running isolated run left them
 * (`LiveVerdicts.preview`), and reports the counts of decided mutants when they
 * changed. Each mutant moves its count from its old status to its new one, so a
 * unit that ends costs as little as the mutants it changed. A survivor the test
 * runner evaluated outside its workers counts as the `Error` it ends with
 * (`markOutsideMutants`). Mutants no test reaches are left out of the counts,
 * unless they end with `Error` that way. Without live counts nothing happens.
 *
 * @param state - State of the run, updated in place.
 * @param mutants - Mutants whose evidence changed.
 */
export function countVerdicts(
  state: RunState,
  mutants: Iterable<MutantState> = state.mutants.values(),
): void {
  let { live } = state
  if (live === null) {
    return
  }
  let { statuses, outside, preview, counts } = live
  for (let mutant of mutants) {
    let { id } = mutant.mutant
    let status = getFinalStatus({ ...mutant, ...preview.get(id) })
    if (
      outside.has(id) &&
      mutant.verdict === null &&
      (status === 'Survived' || status === 'NoCoverage')
    ) {
      status = 'Error'
    }
    let before = statuses.get(id)
    let old = before === undefined ? undefined : COUNTS[before]
    if (old !== undefined) {
      counts[old] -= 1
    }
    if (status === null) {
      statuses.delete(id)
    } else {
      statuses.set(id, status)
      let next = COUNTS[status]
      if (next !== undefined) {
        counts[next] += 1
      }
    }
  }
  let key = Object.values(counts).join(' ')
  if (key !== live.reported) {
    live.reported = key
    state.report({ kind: 'verdicts', ...counts })
  }
}
