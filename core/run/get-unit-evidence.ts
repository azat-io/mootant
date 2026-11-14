import type { IsolatedEvidence } from '../../types/run/isolated-evidence'
import type { MutantVerdict } from '../../types/run/mutant-state'
import type { IsolatedRequest } from '../../types/run/run-state'

/**
 * Turns the outcome of an isolated unit into the evidence of its test file: a
 * timeout waits for its confirmation, unless the unit confirmed one with what
 * stopped it: a timer or a hang in any confirming unit, the hit limit only in
 * one with the raised limit, since a mutant that only makes code hotter goes
 * over the hit limit too, also when the doubled time of a timer's confirmation
 * lets it reach its hot code; a reached pass and a unit that decided nothing
 * are done without a verdict, and any other verdict stands.
 *
 * @param verdict - Outcome of the unit (`readIsolatedUnit`).
 * @param request - Mutant and test file of the unit.
 * @returns Evidence of the test file.
 */
export function getUnitEvidence(
  verdict: MutantVerdict | 'survived' | null,
  request: IsolatedRequest,
): IsolatedEvidence {
  if (verdict === 'survived' || verdict === null) {
    return 'none'
  }
  let confirmed =
    verdict.cause === 'hit-limit' ? request.raised : request.confirming
  if (!confirmed && verdict.status === 'Timeout') {
    return 'confirming'
  }
  return verdict
}
