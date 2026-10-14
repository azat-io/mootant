import type {
  Function as FunctionNode,
  ArrowFunctionExpression,
  Node,
} from 'oxc-parser'

import type { TreeIndex } from '../../types/tree-index'

import { getSlot } from '../tree/get-slot'
import { isFunction } from './is-function'

/**
 * Finds the nearest function around a node: a function declaration, a function
 * expression or an arrow function.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns The nearest enclosing function, or null at the top level.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function getEnclosingFunction(
  tree: TreeIndex,
  node: Node,
): ArrowFunctionExpression | FunctionNode | null {
  let { parent } = getSlot(tree, node)
  while (parent && !isFunction(parent)) {
    ;({ parent } = tree.slots.get(parent)!)
  }
  return parent
}
