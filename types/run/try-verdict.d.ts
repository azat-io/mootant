import type { TryCause } from './try-cause'

/**
 * What `classifyTry` makes of one try's facts.
 */
export interface TryVerdict {
  /**
   * `doubtful`: the try cannot decide the mutant (killed without reaching it,
   * stray error in batch); the core confirms on the isolated path. `unreached`:
   * it passed without reaching the mutant; the core moves on to the next
   * covering test. `survived` and `killed` in batch are only candidates: the
   * core trusts a batch kill when the control tries next to it passed, and
   * rechecks every batch survivor on the isolated path.
   */
  outcome: 'unreached' | 'survived' | 'doubtful' | 'timeout' | 'killed'

  /**
   * How the mutant was detected, or null when it was not.
   */
  cause: TryCause | null
}
