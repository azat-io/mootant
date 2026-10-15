import type { RegisteredMutator } from '../mutator/registered-mutator'
import type { SourceRange } from '../source/source-range'
import type { IgnoreRule } from './ignore-rule'

/**
 * Replacement accepted from a visitor, before ids, the solitary rule and
 * deduplication.
 */
export interface MutantCandidate {
  /**
   * Ranges of the nodes whose effect the mutant removes as a whole, or null
   * when the solitary rule does not apply.
   */
  solitary: readonly SourceRange[] | null

  /**
   * Ignore rule that covers the mutant, or null when it will run.
   */
  ignoreRule: IgnoreRule | null

  /**
   * Mutator that returned the replacement.
   */
  registered: RegisteredMutator

  /**
   * How the mutant is switched on, derived from the replaced node.
   */
  kind: 'expression' | 'block'

  /**
   * Dotted names of the declarations around the replaced node.
   */
  scope: string | null

  /**
   * Position in the order in which visitors returned replacements.
   */
  emission: number

  /**
   * Start of the replaced node.
   */
  start: number

  /**
   * Text written in place of the node.
   */
  text: string

  /**
   * End of the replaced node.
   */
  end: number
}
