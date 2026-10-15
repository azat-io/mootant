import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

import { getNegationTop } from './get-negation-top'
import { isComparison } from './is-comparison'

/**
 * Tells whether a node, through wrappers and the `!` chain above it, is an
 * operand of a comparison (catalog 2.2, comparison operand). The comparison's
 * mutants own its literal operands.
 *
 * @param node - Node of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns Whether the top of the node's negation chain is the left or right
 *   operand of a comparison.
 */
export function isComparisonOperand(
  node: Node,
  context: MutatorContext,
): boolean {
  let { parent, key } = context.syntax.getContextSlot(
    getNegationTop(node, context).node,
  )
  return isComparison(parent) && (key === 'left' || key === 'right')
}
