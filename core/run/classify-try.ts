import type { TryLimits } from '../../types/adapter/try-limits'
import type { TryVerdict } from '../../types/run/try-verdict'
import type { TryFacts } from '../../types/adapter/try-facts'

/**
 * Classifies the raw facts of one try. In order: more site evaluations than the
 * hit limit is a timeout, since only a loop through sites gets there; a try
 * that ran out of time is a timeout when it reached the mutant; stray errors
 * make a batch try doubtful, since orphaned work of an earlier try may throw
 * them, and kill on the isolated path when the try reached the mutant; a
 * failure kills when the try reached the mutant; a pass, or a skip, survives
 * when it reached the mutant. A try that failed, ran out of time or had stray
 * errors without reaching the mutant is doubtful; one that passed without
 * reaching it is unreached.
 *
 * @param facts - Facts the adapter reported for the try.
 * @param limits - Limits the try ran with.
 * @param path - Whether the try ran in a batch or in an isolated unit.
 * @returns Outcome and cause of the try.
 */
export function classifyTry(
  facts: TryFacts,
  limits: TryLimits,
  path: 'isolated' | 'batch',
): TryVerdict {
  if (facts.hits > limits.hitLimit) {
    return { outcome: 'timeout', cause: 'hit-limit' }
  }
  if (facts.timedOut) {
    return facts.reached ?
        { cause: 'time-limit', outcome: 'timeout' }
      : { outcome: 'doubtful', cause: null }
  }
  if (facts.strays.length > 0) {
    return path === 'isolated' && facts.reached ?
        { cause: 'stray-error', outcome: 'killed' }
      : { outcome: 'doubtful', cause: null }
  }
  if (facts.failed) {
    return facts.reached ?
        { cause: 'assertion', outcome: 'killed' }
      : { outcome: 'doubtful', cause: null }
  }
  return { outcome: facts.reached ? 'survived' : 'unreached', cause: null }
}
