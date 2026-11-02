import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'

import { getContextSlot } from '../tree/get-context-slot'

/**
 * Finds the optional chain that a node ends, through parentheses and TypeScript
 * wrappers, or the node itself.
 *
 * @param tree - Runtime tree of the program.
 * @param node - Node of the runtime tree.
 * @returns The ChainExpression whose expression the node is, or the node.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function getChainEnd(tree: TreeIndex, node: Node): Node {
  let { parent } = getContextSlot(tree, node)
  return parent?.type === 'ChainExpression' ? parent : node
}
