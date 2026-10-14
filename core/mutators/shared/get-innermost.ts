import type { Node } from 'oxc-parser'

import { unwrapExpression } from '../../tree/unwrap-expression'
import { isNegation } from './is-negation'

/**
 * Node at the bottom of a negation chain.
 */
export interface Innermost {
  /**
   * Number of `!` operators on the way down.
   */
  negations: number

  /**
   * First node that is neither a wrapper nor a `!`.
   */
  node: Node
}

/**
 * Descends from a node through parentheses, TypeScript wrappers and `!`
 * operators (catalog 2.2, `innermost`).
 *
 * @param node - Node to start from.
 * @returns The innermost node and the number of `!` crossed.
 */
export function getInnermost(node: Node): Innermost {
  let inner = unwrapExpression(node)
  let negations = 0
  while (isNegation(inner)) {
    inner = unwrapExpression(inner.argument)
    negations += 1
  }
  return { node: inner, negations }
}
