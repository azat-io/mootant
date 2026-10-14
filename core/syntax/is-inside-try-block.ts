import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/tree-index'

import { getSlot } from '../tree/get-slot'

/**
 * Nodes that start code which a `try` statement around them does not cover for
 * a `return`.
 */
let boundaryTypes = new Set([
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'PropertyDefinition',
  'FunctionExpression',
  'StaticBlock',
])

/**
 * Tells whether `return await` would differ from `return` at a node: the node
 * is inside the `try` block of a try statement, or inside its `catch` block
 * when it has a `finally` block, without a function boundary in between.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns Whether a rejection awaited at the node would still be handled by
 *   the try statement.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isInsideTryBlock(tree: TreeIndex, node: Node): boolean {
  let slot = getSlot(tree, node)
  while (slot.parent && !boundaryTypes.has(slot.parent.type)) {
    let { parent, key } = slot
    if (
      parent.type === 'TryStatement' &&
      (key === 'block' || (key === 'handler' && parent.finalizer !== null))
    ) {
      return true
    }
    slot = tree.slots.get(parent)!
  }
  return false
}
