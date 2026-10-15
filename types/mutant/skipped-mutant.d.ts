import type { SkipJustifier } from './skip-justifier'
import type { SkipCategory } from './skip-category'
import type { SkipRuleId } from './skip-rule-id'

/**
 * Mutation that a mutator or the pipeline considered and did not emit. It has
 * no id and never runs.
 */
export interface SkippedMutant {
  /**
   * How the mutant switch would host the replacement, derived from the replaced
   * node; null when it cannot host it.
   */
  kind: 'expression' | 'block' | null

  /**
   * Mutant that justifies the skip, or null when no single mutant does.
   */
  by: SkipJustifier | null

  /**
   * Category of the skip rule.
   */
  category: SkipCategory

  /**
   * Text that would have been written in place of the range.
   */
  replacement: string

  /**
   * Whether the skip rests on a guess rather than on a proof.
   */
  heuristic: boolean

  /**
   * Id of the skip rule.
   */
  rule: SkipRuleId

  /**
   * Id of the mutator that considered the mutation.
   */
  mutator: string

  /**
   * Plain-English reason of the skip.
   */
  reason: string

  /**
   * Offset of the first replaced UTF-16 code unit.
   */
  start: number

  /**
   * Path of the file relative to the working directory, with `/` separators.
   */
  file: string

  /**
   * Offset just past the last replaced UTF-16 code unit.
   */
  end: number
}
