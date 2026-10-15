import type { ChainExpression, Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'
import type { NodeSlot } from '../../types/syntax/node-slot'

import { getRawSlot } from '../tree/get-raw-slot'

/**
 * Finds the optional chain a node is part of: the node itself when it is a
 * ChainExpression, otherwise the ChainExpression reached by climbing while the
 * node is the `object` of a member, the `callee` of a call or the operand of a
 * non-null assertion. Parentheses end a chain, so in `(a?.b).c` the member `.c`
 * is not part of the chain of `a?.b`.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns The enclosing ChainExpression, or null when the node is not part of
 *   an optional chain.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function getChainRoot(
  tree: TreeIndex,
  node: Node,
): ChainExpression | null {
  let slot = getRawSlot(tree, node)
  if (node.type === 'ChainExpression') {
    return node
  }
  while (isChainLink(slot)) {
    slot = tree.slots.get(slot.parent)!
  }
  return slot.parent?.type === 'ChainExpression' ? slot.parent : null
}

/**
 * Tells whether the node in a slot continues a member chain upward.
 *
 * @param slot - Raw slot of a node.
 * @returns Whether the node is the object of a member, the callee of a call or
 *   the operand of a non-null assertion.
 */
function isChainLink(slot: NodeSlot): slot is { parent: Node } & NodeSlot {
  let { parent, key } = slot
  switch (parent?.type) {
    case 'TSNonNullExpression':
      return true
    case 'MemberExpression':
      return key === 'object'
    case 'CallExpression':
      return key === 'callee'
    default:
      return false
  }
}
