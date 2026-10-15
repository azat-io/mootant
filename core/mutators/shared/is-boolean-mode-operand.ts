import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

import { getNegationTop } from './get-negation-top'
import { isBooleanMode } from './is-boolean-mode'
import { isAndOr } from './is-and-or'

/**
 * Tells whether a node, through wrappers and the `!` chain above it, is an
 * operand of a `&&` or `||` in boolean mode (catalog 2.2, boolean-mode
 * operand). Its truth value belongs to logical-operator (O3).
 *
 * @param node - Node of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns Whether the node is a boolean-mode operand.
 */
export function isBooleanModeOperand(
  node: Node,
  context: MutatorContext,
): boolean {
  let { parent } = context.syntax.getContextSlot(
    getNegationTop(node, context).node,
  )
  return isAndOr(parent) && isBooleanMode(parent, context)
}
