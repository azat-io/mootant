import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/tree-index'
import type { NodeSlot } from '../../types/node-slot'

/**
 * Reads the raw slot of a node from the tree index: its own parent, key and
 * index, with no wrapper skipped.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns Raw slot of the node.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function getRawSlot(tree: TreeIndex, node: Node): NodeSlot {
  let slot = tree.slots.get(node)
  if (!slot) {
    throw new Error('Node is not part of the runtime tree of the file.')
  }
  return slot
}
