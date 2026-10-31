import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'
import type { NodeSlot } from '../../types/syntax/node-slot'

import { getContextSlot } from '../tree/get-context-slot'

/**
 * Finds the slot that takes the value of an expression: its context slot, or,
 * for the last expression of a sequence, the slot that takes the value of the
 * sequence. Parentheses and TypeScript expression wrappers are looked through.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns Parent, key and index of the slot.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function getResultSlot(tree: TreeIndex, node: Node): NodeSlot {
  let slot = getContextSlot(tree, node)
  while (
    slot.parent?.type === 'SequenceExpression' &&
    slot.index === slot.parent.expressions.length - 1
  ) {
    slot = getContextSlot(tree, slot.parent)
  }
  return slot
}
