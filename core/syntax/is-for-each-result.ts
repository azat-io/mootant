import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'

import { unwrapExpression } from '../tree/unwrap-expression'
import { getContextSlot } from '../tree/get-context-slot'
import { getResultSlot } from './get-result-slot'

/**
 * Tells whether the value of an expression is what a callback of `forEach`
 * returns, which `forEach` ignores: the expression is the concise body of an
 * arrow function that is the first argument of a call of a `forEach` method, a
 * member that is neither computed nor private. The last expression of a
 * sequence is such a value when the sequence is. Parentheses and TypeScript
 * expression wrappers are looked through. The method name is a heuristic: an
 * arbitrary object may define a `forEach` that reads what its callback
 * returns.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns Whether only `forEach` gets the value, from its callback.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isForEachResult(tree: TreeIndex, node: Node): boolean {
  let { parent: arrow, key } = getResultSlot(tree, node)
  if (
    key !== 'body' ||
    arrow?.type !== 'ArrowFunctionExpression' ||
    !arrow.expression
  ) {
    return false
  }
  let { parent: call, index } = getContextSlot(tree, arrow)
  if (index !== 0 || call?.type !== 'CallExpression') {
    return false
  }
  let callee = unwrapExpression(call.callee)
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'forEach'
  )
}
