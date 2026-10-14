import type { Node } from 'oxc-parser'

import { getLiteralValue } from './get-literal-value'

/**
 * Tells whether the literal mutator of an expression changes its truth value
 * (catalog 4.8, `??` in truth positions): a boolean or string literal, a
 * template without expressions, and the numbers `0`, `-1`, `0n` and `-1n`,
 * which become `1`, `0`, `1n` and `0n`.
 *
 * @param node - Expression, through parentheses.
 * @returns Whether adding one or emptying the literal flips its truth value.
 */
export function isTruthFlippingLiteral(node: Node): boolean {
  let value = getLiteralValue(node)
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return true
    case 'number':
    case 'bigint':
      return Number(value) === 0 || Number(value) === -1
    default:
      return false
  }
}
