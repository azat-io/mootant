import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

import { getCallbackOwner } from './get-callback-owner'

/**
 * Tells whether a node is a result of a sort comparator that method-call can
 * remove (catalog 4.11, EQ): its concise body, the argument of one of its
 * `return` statements, or a branch of a conditional expression that is one.
 * Only the sign of a comparator's result matters.
 *
 * @param node - Numeric constant.
 * @param context - Mutator context of the file.
 * @returns Whether the node is a result of a no-op callback's comparator.
 */
export function isComparatorResult(
  node: Node,
  context: MutatorContext,
): boolean {
  let { syntax } = context
  let slot = syntax.getContextSlot(node)
  while (slot.parent?.type === 'ConditionalExpression' && slot.key !== 'test') {
    slot = syntax.getContextSlot(slot.parent)
  }
  let { parent, key } = slot
  let callback: Node | null = null
  if (key === 'body' && parent?.type === 'ArrowFunctionExpression') {
    callback = parent
  } else if (parent?.type === 'ReturnStatement') {
    callback = syntax.getEnclosingFunction(parent)
  }
  return callback !== null && getCallbackOwner(callback, context) !== null
}
