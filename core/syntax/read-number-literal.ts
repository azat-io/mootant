import type { Node } from 'oxc-parser'

import { unwrapExpression } from '../tree/unwrap-expression'

/**
 * Reads the value of a finite number literal, or of `-` applied to one, through
 * parentheses and TypeScript expression wrappers.
 *
 * @param node - Expression to read.
 * @returns The number, or null for any other expression.
 */
export function readNumberLiteral(node: Node): number | null {
  let current = unwrapExpression(node)
  let sign = 1
  if (current.type === 'UnaryExpression' && current.operator === '-') {
    sign = -1
    current = unwrapExpression(current.argument)
  }
  return (
      current.type === 'Literal' &&
        typeof current.value === 'number' &&
        Number.isFinite(current.value)
    ) ?
      sign * current.value
    : null
}
