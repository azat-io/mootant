import type { Node } from 'oxc-parser'

import { unwrapParentheses } from '../../tree/unwrap-parentheses'

/**
 * Value a literal stands for.
 */
export type LiteralValue = boolean | string | number | bigint

/**
 * Reads the literal value of an expression (catalog 2.2): the cooked value of a
 * string literal, the value of a number or BigInt literal or of `-` applied
 * directly to one, the value of a boolean literal, and the cooked text of a
 * template without expressions.
 *
 * @param node - Expression, through parentheses.
 * @returns The value, or null for any other expression, `null` and regular
 *   expressions included.
 */
export function getLiteralValue(node: Node): LiteralValue | null {
  let inner = unwrapParentheses(node)
  switch (inner.type) {
    case 'UnaryExpression': {
      let { argument, operator } = inner
      let value =
        operator === '-' && argument.type === 'Literal' ? argument.value : null
      return typeof value === 'number' || typeof value === 'bigint' ?
          -value
        : null
    }
    case 'TemplateLiteral':
      return inner.expressions.length === 0 ?
          (inner.quasis[0]!.value.cooked ?? null)
        : null
    case 'Literal':
      return isLiteralValue(inner.value) ? inner.value : null
    default:
      return null
  }
}

/**
 * Tells whether the value of a Literal node is one the catalog reads.
 *
 * @param value - Value of a Literal node.
 * @returns Whether the value is a boolean, string, number or BigInt.
 */
function isLiteralValue(value: unknown): value is LiteralValue {
  switch (typeof value) {
    case 'boolean':
    case 'string':
    case 'number':
    case 'bigint':
      return true
    default:
      return false
  }
}
