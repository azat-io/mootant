import type { RegisteredMutator } from '../mutator/registered-mutator'
import type { SkipJustifier } from './skip-justifier'
import type { TextEdit } from '../source/text-edit'
import type { SkipRuleId } from './skip-rule-id'
import type { MutantKind } from './mutant-kind'

/**
 * Replacement that was considered and not emitted, before it is sorted.
 */
export interface SkippedCandidate {
  /**
   * Mutator that considered the replacement.
   */
  registered: RegisteredMutator

  /**
   * Mutant that justifies the skip, or null.
   */
  by: SkipJustifier | null

  /**
   * How the mutant switch would host the replacement, derived from the replaced
   * node or from the literal of a removed element or member; null when it
   * cannot host it.
   */
  kind: MutantKind | null

  /**
   * Whether the skip rests on a guess beyond its rule.
   */
  heuristic: boolean

  /**
   * Edit inside the replaced range that the mutant amounts to, which reports
   * show in place of the whole range; set when the mutator names one, and on
   * every removal of kind `element` or `property`.
   */
  focus?: TextEdit

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
   * Start of the replaced range.
   */
  start: number

  /**
   * Text that would have been written in place of the range.
   */
  text: string

  /**
   * End of the replaced range.
   */
  end: number
}
