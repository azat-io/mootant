import type { RegisteredMutator } from '../mutator/registered-mutator'
import type { SkipJustifier } from './skip-justifier'
import type { SkipRuleId } from './skip-rule-id'

/**
 * Replacement that was considered and not emitted, before it is sorted.
 */
export interface SkippedCandidate {
  /**
   * How the mutant switch would host the replacement, derived from the replaced
   * node; null when it cannot host it.
   */
  kind: 'expression' | 'block' | null

  /**
   * Mutator that considered the replacement.
   */
  registered: RegisteredMutator

  /**
   * Mutant that justifies the skip, or null.
   */
  by: SkipJustifier | null

  /**
   * Whether the skip rests on a guess beyond its rule.
   */
  heuristic: boolean

  /**
   * Position in the order in which skipped replacements were found.
   */
  emission: number

  /**
   * Id of the skip rule.
   */
  rule: SkipRuleId

  /**
   * Plain-English reason of the skip.
   */
  reason: string

  /**
   * Start of the replaced node.
   */
  start: number

  /**
   * Text that would have been written in place of the node.
   */
  text: string

  /**
   * End of the replaced node.
   */
  end: number
}
