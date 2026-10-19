import type { IsolatedEvidence } from '../../types/run/isolated-evidence'
import type { MutantVerdict } from '../../types/run/mutant-state'
import type { IsolatedRequest } from '../../types/run/run-state'

/**
 * Turns the outcome of an isolated unit into the evidence of its test file: a
 * timer or hang timeout of a unit that does not confirm one yet waits for its
 * confirmation, a reached pass and a unit that decided nothing are done without
 * a verdict, and any other verdict stands.
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
  if (
    verdict.status === 'Timeout' &&
    (verdict.cause === 'time-limit' || verdict.cause === 'hang') &&
    !request.confirming
  ) {
    return 'confirming'
  }
  return verdict
}
