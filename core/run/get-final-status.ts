import type { MutantState } from '../../types/run/mutant-state'
import type { RunStatus } from '../../types/run/run-status'

import { decideEvidence } from './decide-evidence'

/**
 * Tells the status of a mutant once it can no longer change in the run: a kill,
 * a confirmed timeout or an error at once; on the isolated path, once its
 * evidence decides it (`decideEvidence`), with a reached pass making it
 * `Survived`; a mutant nothing runs has no coverage. A mutant still waiting on
 * the batch path, for a test file, a confirmation or a retry, has none yet.
 *
 * @param mutant - State of the mutant, or its evidence as the finished units of
 *   a running isolated run left it.
 * @returns Final status, or null while undecided.
 */
export function getFinalStatus(
  mutant: Pick<
    MutantState,
    'evidence' | 'survived' | 'verdict' | 'ranked' | 'path'
  >,
): RunStatus | null {
  if (mutant.verdict !== null) {
    return mutant.verdict.status
  }
  if (mutant.path === null) {
    return 'NoCoverage'
  }
  let decided = mutant.path === 'batch' ? null : decideEvidence(mutant)
  if (decided === null) {
    return null
  }
  if (decided.verdict !== null) {
    return decided.verdict.status
  }
  return mutant.survived ? 'Survived' : 'NoCoverage'
}
