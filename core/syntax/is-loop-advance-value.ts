import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/tree-index'

import { getContextSlot } from '../tree/get-context-slot'
import { advancesLoop } from './advances-loop'

/**
 * Tells whether a node is, through parentheses and TypeScript expression
 * wrappers, the whole right-hand side of an `=` assignment to a name, or to a
 * destructuring pattern that binds a name, that a loop around the assignment
 * reads to decide whether to go on (`done = true`, `s = s.slice(1)`, `({ done }
 * = await reader.read())`). Replacing such a value can stop the loop from
 * advancing.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns Whether the node is the value that advances a loop.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isLoopAdvanceValue(tree: TreeIndex, node: Node): boolean {
  let { parent, key } = getContextSlot(tree, node)
  return (
    parent?.type === 'AssignmentExpression' &&
    parent.operator === '=' &&
    key === 'right' &&
    advancesLoop(tree, parent)
  )
}
