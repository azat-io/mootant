import type { UnaryExpression, Node } from 'oxc-parser'

/**
 * Tells whether a node is a logical negation, a `!` unary expression.
 *
 * @param node - Node to check, or null.
 * @returns Whether the node applies `!`.
 */
export function isNegation(
  node: Node | null,
): node is { operator: '!' } & UnaryExpression {
  return node?.type === 'UnaryExpression' && node.operator === '!'
}
