import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'
import type { NodeSlot } from '../../types/syntax/node-slot'

import { getRawSlot } from './get-raw-slot'

/**
 * Finds where a node sits, looking through parentheses: the slot of the
 * outermost ParenthesizedExpression around the node in the first parent that is
 * not one. In `if ((a))` the slot of `a` is the `test` of the IfStatement.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns Parent, key and index of the node through parentheses.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function getSlot(tree: TreeIndex, node: Node): NodeSlot {
  let slot = getRawSlot(tree, node)
  while (slot.parent?.type === 'ParenthesizedExpression') {
    slot = getRawSlot(tree, slot.parent)
  }
  return slot
}
