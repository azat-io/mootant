import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'

import { getContextSlot } from '../tree/get-context-slot'

/**
 * Tells whether a node is an operand of `&&`, `||` or `??`, looking through
 * parentheses and TypeScript expression wrappers.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns Whether the parent of the node is a logical expression.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isLogicalOperand(tree: TreeIndex, node: Node): boolean {
  return getContextSlot(tree, node).parent?.type === 'LogicalExpression'
}
