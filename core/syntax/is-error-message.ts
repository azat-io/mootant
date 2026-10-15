import type { CallExpression, NewExpression, Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'

import { isExpressionWrapper } from '../tree/is-expression-wrapper'
import { unwrapExpression } from '../tree/unwrap-expression'
import { getCalleeName } from '../tree/get-callee-name'
import { getMemberPath } from './get-member-path'
import { isStatement } from './is-statement'
import { getSlot } from '../tree/get-slot'
import { isFunction } from './is-function'

/**
 * Callee paths of assertions whose second argument is the message.
 */
let assertionPaths = new Set(['assert.ok', 'invariant', 'assert'])

/**
 * Name of an error constructor: `Error` or a capitalized name ending with
 * `Error`, such as `TypeError` or `ValidationError`.
 */
const ERROR_CONSTRUCTOR_PATTERN = /^(?:[A-Z]\w*)?Error$/u

/**
 * Tells whether a node is part of the message of an error. Walking up to the
 * first function boundary, and stopping at the first statement or declaration
 * other than a `throw`, it looks for the arguments of a `new` or call whose
 * callee name is an error constructor name, such as `Error` or
 * `ValidationError` but not `setError`, the second argument of `assert`,
 * `assert.ok` or `invariant`, or the operand of a `throw`, reached directly or
 * through parentheses, TypeScript expression wrappers and `+` operands.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns Whether the node only shapes the text of an error.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isErrorMessage(tree: TreeIndex, node: Node): boolean {
  let slot = getSlot(tree, node)
  let isThrownOperand = true
  while (slot.parent && !isFunction(slot.parent)) {
    let { parent, index, key } = slot
    if (parent.type === 'ThrowStatement') {
      return isThrownOperand
    }
    if (isStatement(parent)) {
      return false
    }
    if (
      key === 'arguments' &&
      (parent.type === 'CallExpression' || parent.type === 'NewExpression') &&
      isMessageArgument(parent, index!)
    ) {
      return true
    }
    isThrownOperand &&=
      isExpressionWrapper(parent) ||
      (parent.type === 'BinaryExpression' && parent.operator === '+')
    slot = tree.slots.get(parent)!
  }
  return false
}

/**
 * Tells whether an argument of a call or `new` is a part of an error message.
 *
 * @param node - Call or `new` expression.
 * @param index - Position of the argument.
 * @returns Whether the callee name is an error constructor name, or the callee
 *   is an assertion and the argument is its second one.
 */
function isMessageArgument(
  node: CallExpression | NewExpression,
  index: number,
): boolean {
  let callee = unwrapExpression(node.callee)
  let name = getCalleeName(callee)
  if (name !== null && ERROR_CONSTRUCTOR_PATTERN.test(name)) {
    return true
  }
  let path = getMemberPath(callee)
  return (
    node.type === 'CallExpression' &&
    index === 1 &&
    path !== null &&
    assertionPaths.has(path.join('.'))
  )
}
