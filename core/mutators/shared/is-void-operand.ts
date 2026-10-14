import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'

import { getNegationTop } from './get-negation-top'

/**
 * Tells whether a node, through wrappers and the `!` chain above it, is the
 * operand of `void`. The value of `void x` is always `undefined`, so a changed
 * literal there gives an equivalent mutant (catalog 1.2, EQ).
 *
 * @param node - Node of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns Whether the top of the node's negation chain is a `void` operand.
 */
export function isVoidOperand(node: Node, context: MutatorContext): boolean {
  let { parent } = context.syntax.getContextSlot(
    getNegationTop(node, context).node,
  )
  return parent?.type === 'UnaryExpression' && parent.operator === 'void'
}
