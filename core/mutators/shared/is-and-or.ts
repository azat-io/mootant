import type { LogicalExpression, Node } from 'oxc-parser'

/**
 * Tells whether a node is a logical expression with `&&` or `||`, as opposed to
 * `??`.
 *
 * @param node - Node to check, or null.
 * @returns Whether the node is a `&&` or `||` expression.
 */
export function isAndOr(
  node: Node | null,
): node is { operator: '&&' | '||' } & LogicalExpression {
  return (
    node?.type === 'LogicalExpression' &&
    (node.operator === '&&' || node.operator === '||')
  )
}
