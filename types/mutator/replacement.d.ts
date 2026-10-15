import type { Node } from 'oxc-parser'

import type { SkipNote } from '../mutant/skip-note'

/**
 * Proposal of a mutator: replace one node of the file with new text.
 */
export interface Replacement {
  /**
   * Nodes whose effect a coarse mutant removes as a whole, such as a removed
   * statement, or a returned local with its initializer and writes. The mutant
   * is dropped when another counted mutant of the file lies inside one of them
   * (the solitary rule).
   */
  solitary?: readonly Node[]

  /**
   * Why the mutator does not emit the replacement. A skipped replacement never
   * becomes a mutant and never counts for the solitary rule, deduplication or
   * ids; `mootant list --skipped` shows it with the reason.
   */
  skip?: SkipNote

  /**
   * Text written in place of the node, built from slices of the original
   * source. An expression must parse inside parentheses, a statement list
   * inside braces.
   */
  text: string

  /**
   * Node whose whole range, from `node.start` to `node.end`, is replaced: an
   * expression in a value position or a statement of the runtime tree.
   */
  node: Node
}
