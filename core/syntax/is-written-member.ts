import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'

import { getContextSlot } from '../tree/get-context-slot'
import { isWriteTarget } from './is-write-target'
import { getChainEnd } from './get-chain-end'

/**
 * Tells whether code writes or deletes a member: it is, through parentheses,
 * TypeScript wrappers and the optional chain it ends, a write target (see
 * `isWriteTarget`) or the operand of `delete`.
 *
 * @param tree - Runtime tree of the program.
 * @param node - Member of the runtime tree.
 * @returns Whether the member is written or deleted.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isWrittenMember(tree: TreeIndex, node: Node): boolean {
  let slot = getContextSlot(tree, getChainEnd(tree, node))
  return (
    isWriteTarget(tree, slot) ||
    (slot.parent?.type === 'UnaryExpression' &&
      slot.parent.operator === 'delete')
  )
}
