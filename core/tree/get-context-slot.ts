import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'
import type { NodeSlot } from '../../types/syntax/node-slot'

import { isExpressionWrapper } from './is-expression-wrapper'
import { getRawSlot } from './get-raw-slot'

/**
 * Finds where a node sits once parentheses and TypeScript expression wrappers
 * around it are skipped, so that `while ((ready as boolean))` makes `ready` the
 * test of the loop.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns Parent, key and index of the outermost wrapper around the node.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function getContextSlot(tree: TreeIndex, node: Node): NodeSlot {
  let slot = getRawSlot(tree, node)
  while (slot.parent && isExpressionWrapper(slot.parent)) {
    slot = getRawSlot(tree, slot.parent)
  }
  return slot
}
