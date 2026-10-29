import type { Node } from 'oxc-parser'

import { getLiteralValue } from './get-literal-value'

/**
 * Tells whether an operand is a number or BigInt literal, or `-` applied to
 * one.
 *
 * @param node - Operand, through parentheses.
 * @returns Whether the operand is a number literal.
 */
export function isNumberLiteral(node: Node): boolean {
  let value = getLiteralValue(node)
  return typeof value === 'number' || typeof value === 'bigint'
}
