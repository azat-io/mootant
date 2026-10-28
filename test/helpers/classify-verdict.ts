import type { MutantResult } from '../../types/run/mutant-result'

/**
 * Reduces a verdict to whether the mutant was detected; a mutant no test
 * reached survives a plain run too.
 *
 * @param result - Verdict of a mutant.
 * @returns `killed`, `survived`, or the status itself when it is neither.
 */
export function classifyVerdict(result: MutantResult): string {
  if (result.status === 'Killed') {
    return 'killed'
  }
  if (result.status === 'Survived' || result.status === 'NoCoverage') {
    return 'survived'
  }
  return result.status
}
