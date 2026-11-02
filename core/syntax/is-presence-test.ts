import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'

import { unwrapExpression } from '../tree/unwrap-expression'
import { getContextSlot } from '../tree/get-context-slot'
import { isTruthTest } from './is-truth-test'
import { getChainEnd } from './get-chain-end'

/**
 * Operators that compare a value with `null` without looking inside the value.
 */
let equalityOperators = new Set(['===', '!==', '==', '!='])

/**
 * Tells whether the code around a node only tells null or undefined from an
 * object, for a value that is one of them, as the result of a match call is:
 * the node, or the optional chain it ends, is tested for truth (see
 * `isTruthTest`), compared with `null` or the left operand of `&&`, whose value
 * goes on only when it is falsy. Parentheses and TypeScript expression wrappers
 * are looked through.
 *
 * @param tree - Runtime tree of the program.
 * @param node - Node of the runtime tree.
 * @returns Whether only the presence of the value is used.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isPresenceTest(tree: TreeIndex, node: Node): boolean {
  let value = getChainEnd(tree, node)
  let { parent, key } = getContextSlot(tree, value)
  if (parent?.type === 'BinaryExpression') {
    return (
      equalityOperators.has(parent.operator) &&
      isNullLiteral(key === 'left' ? parent.right : parent.left)
    )
  }
  return (
    (parent?.type === 'LogicalExpression' &&
      parent.operator === '&&' &&
      key === 'left') ||
    isTruthTest(tree, value)
  )
}

/**
 * Tells whether an expression is `null`, through parentheses and TypeScript
 * expression wrappers.
 *
 * @param node - Expression to check.
 * @returns Whether the expression is the literal `null`.
 */
function isNullLiteral(node: Node): boolean {
  let operand = unwrapExpression(node)
  return operand.type === 'Literal' && operand.raw === 'null'
}
