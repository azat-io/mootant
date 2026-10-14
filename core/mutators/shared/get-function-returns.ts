import type {
  Function as FunctionNode,
  ArrowFunctionExpression,
  ReturnStatement,
} from 'oxc-parser'

import { isFunction } from '../../syntax/is-function'
import { walkTree } from '../../tree/walk-tree'

/**
 * Collects the `return` statements of a function, without those of nested
 * functions.
 *
 * @param node - Function or arrow function.
 * @returns The return statements in source order; none for a concise arrow
 *   body.
 */
export function getFunctionReturns(
  node: ArrowFunctionExpression | FunctionNode,
): ReturnStatement[] {
  let returns: ReturnStatement[] = []
  if (node.body?.type !== 'BlockStatement') {
    return returns
  }
  walkTree(node.body, child => {
    if (child.type === 'ReturnStatement') {
      returns.push(child)
    }
    return !isFunction(child)
  })
  return returns
}
