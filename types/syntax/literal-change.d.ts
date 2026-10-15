import type { LiteralValue } from '../../core/mutators/shared/get-literal-value'

/**
 * Change a literal mutator makes to a literal: a new value, or the new text of
 * a template with expressions.
 */
export type LiteralChange = ValueChange | TextChange

/**
 * New value a literal mutator gives a literal, compared by value with other
 * literals.
 */
interface ValueChange {
  /**
   * Literal value the mutant gives the node.
   */
  value: LiteralValue
}

/**
 * New text of a template with expressions, compared by text with other nodes.
 */
interface TextChange {
  /**
   * Replacement text of the mutant.
   */
  text: string
}
