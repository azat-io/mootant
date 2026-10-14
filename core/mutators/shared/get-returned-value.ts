import type { Node } from 'oxc-parser'

import { unwrapParentheses } from '../../tree/unwrap-parentheses'

/**
 * Reads the value returned by a branch that consists of one `return` (catalog
 * 2.2, branch pairs and return switches).
 *
 * @param node - Branch of an `if`, or null.
 * @returns The argument, without parentheses, of the `return` that is the node
 *   or the only statement of a block; null otherwise.
 */
export function getReturnedValue(node: Node | null): Node | null {
  if (!node) {
    return null
  }
  let statement =
    node.type === 'BlockStatement' && node.body.length === 1 ?
      node.body[0]!
    : node
  return statement.type === 'ReturnStatement' && statement.argument ?
      unwrapParentheses(statement.argument)
    : null
}
