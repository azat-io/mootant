import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'

import { isNegation } from './is-negation'

/**
 * Top of the negation chain above a node.
 */
export interface NegationTop {
  /**
   * Number of `!` operators between the node and the top.
   */
  negations: number

  /**
   * Outermost `!` of the chain, or the node itself.
   */
  node: Node
}

/**
 * Climbs from a node through the `!` operators above it, looking through
 * parentheses and TypeScript wrappers (catalog 2.2, `chainTop` and
 * `negations`).
 *
 * @param node - Node of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns The top of the chain and the number of `!` on the way.
 */
export function getNegationTop(
  node: Node,
  context: MutatorContext,
): NegationTop {
  let top = node
  let negations = 0
  let { parent } = context.syntax.getContextSlot(top)
  while (isNegation(parent)) {
    top = parent
    negations += 1
    ;({ parent } = context.syntax.getContextSlot(top))
  }
  return { node: top, negations }
}
