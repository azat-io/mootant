import type { PrivateInExpression, BinaryExpression, Node } from 'oxc-parser'

import type { ComparisonOperator } from '../../syntax/is-comparison-operator'

import { isComparisonOperator } from '../../syntax/is-comparison-operator'

/**
 * Tells whether a node is a comparison (catalog 2.2): a binary expression with
 * a relational or equality operator, `in` (also with a private name) or
 * `instanceof`.
 *
 * @param node - Node to check, or null.
 * @returns Whether the node is a comparison.
 */
export function isComparison(node: Node | null): node is (
  PrivateInExpression | BinaryExpression
) & {
  operator: ComparisonOperator
} {
  return (
    node?.type === 'BinaryExpression' && isComparisonOperator(node.operator)
  )
}
