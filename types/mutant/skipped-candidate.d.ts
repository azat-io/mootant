import type { RegisteredMutator } from '../mutator/registered-mutator'
import type { SkipJustifier } from './skip-justifier'
import type { SkipCategory } from './skip-category'
import type { TextEdit } from '../source/text-edit'
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
   * Category of the skip rule.
   */
  category: SkipCategory

  /**
   * Whether the skip rests on a guess: its rule is a heuristic, or the skip
   * also rests on one.
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
   * Id of the skip rule: a built-in id, or `namespace/name` for a rule of a
   * plugin.
   */
  rule: string

  /**
   * End of the replaced range.
   */
  end: number
}
