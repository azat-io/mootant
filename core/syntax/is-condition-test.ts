import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/tree-index'

import { getContextSlot } from '../tree/get-context-slot'

/**
 * Nodes whose `test` chooses between two branches.
 */
let conditionTypes = new Set(['ConditionalExpression', 'IfStatement'])

/**
 * Tells whether a node is the test of an `if` statement or a conditional
 * expression, looking through parentheses and TypeScript expression wrappers.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns Whether the node chooses which branch runs.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isConditionTest(tree: TreeIndex, node: Node): boolean {
  let { parent, key } = getContextSlot(tree, node)
  return key === 'test' && conditionTypes.has(parent!.type)
}
