import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'

import { isExpectedBoolean } from './is-expected-boolean'
import { isBooleanValued } from './is-boolean-valued'
import { getNegationTop } from './get-negation-top'
import { isAndOr } from './is-and-or'

/**
 * Tells whether a `&&` or `||` expression is in boolean mode (catalog 2.2):
 * only its truth value is observed, it is boolean-valued, a boolean is expected
 * there, or it is an operand, through wrappers and `!`, of a `&&` or `||` in
 * boolean mode. Otherwise it is in value mode.
 *
 * @param node - Logical expression of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns Whether the expression is in boolean mode.
 */
export function isBooleanMode(node: Node, context: MutatorContext): boolean {
  if (
    context.syntax.isBooleanContext(node) ||
    isBooleanValued(node, context) ||
    isExpectedBoolean(node, context)
  ) {
    return true
  }
  let { parent } = context.syntax.getContextSlot(
    getNegationTop(node, context).node,
  )
  return isAndOr(parent) && isBooleanMode(parent, context)
}
