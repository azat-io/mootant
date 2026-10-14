import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/tree-index'

import { getContextSlot } from '../tree/get-context-slot'
import { isTestedLoop } from './is-tested-loop'

/**
 * Tells whether a node is the test of a `for`, `while` or `do...while` loop,
 * looking through parentheses and TypeScript expression wrappers.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns Whether the node decides whether the loop goes on.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isLoopTest(tree: TreeIndex, node: Node): boolean {
  let { parent, key } = getContextSlot(tree, node)
  return key === 'test' && isTestedLoop(parent)
}
