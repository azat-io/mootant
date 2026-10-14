import type { Node } from 'oxc-parser'

/**
 * Strips ParenthesizedExpression wrappers from a node.
 *
 * @param node - Node that may be parenthesized, once or several times.
 * @returns The first node inside the parentheses that is not itself a
 *   ParenthesizedExpression.
 */
export function unwrapParentheses(node: Node): Node {
  let current = node
  while (current.type === 'ParenthesizedExpression') {
    current = current.expression
  }
  return current
}
