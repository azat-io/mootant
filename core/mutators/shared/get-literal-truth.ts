import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'

import { isNullishConstant } from './is-nullish-constant'
import { getLiteralValue } from './get-literal-value'

/**
 * Reads the truth value of a literal (catalog 4.8, fixed operands): a boolean,
 * string, number or BigInt literal, `-` applied to a number literal, a template
 * without expressions, `null`, an unresolved `undefined` and `void x`.
 *
 * @param node - Expression, through parentheses.
 * @param context - Mutator context of the file.
 * @returns The truth value, or null when the expression is not such a literal.
 */
export function getLiteralTruth(
  node: Node,
  context: MutatorContext,
): boolean | null {
  let value = getLiteralValue(node)
  if (value !== null) {
    return Boolean(value)
  }
  if (isNullishConstant(node, context)) {
    return false
  }
  return null
}
