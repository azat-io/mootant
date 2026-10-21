import type { Node } from 'oxc-parser'

import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'
import type { TreeIndex } from '../../types/syntax/tree-index'

import { getEnclosingFunction } from './get-enclosing-function'
import { unwrapExpression } from '../tree/unwrap-expression'
import { getContextSlot } from '../tree/get-context-slot'
import { passesTruthiness } from './passes-truthiness'

/**
 * Array methods that read only the truthiness of what their first argument
 * returns.
 */
let predicateMethods = new Set([
  'findLastIndex',
  'findIndex',
  'findLast',
  'filter',
  'every',
  'find',
  'some',
])

/**
 * Tells whether only the truthiness of the value of a node is used: it is the
 * test of a condition or a loop, the operand of `!`, the first argument of the
 * global `Boolean`, or the returned value of a callback of `every`, `filter`,
 * `find`, `findIndex`, `findLast`, `findLastIndex` or `some`. An operand of
 * `&&` or `||`, the right operand of `??`, a branch of `?:` and the last
 * expression of a sequence are in a boolean context when their parent is.
 * Parentheses and TypeScript expression wrappers are looked through.
 *
 * @param tree - Runtime tree of the file.
 * @param scopes - Scope analysis of the file, which tells whether `Boolean` is
 *   the global function.
 * @param node - Node of the runtime tree.
 * @returns Whether the value of the node matters only as true or false.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isBooleanContext(
  tree: TreeIndex,
  scopes: ScopeAnalysis,
  node: Node,
): boolean {
  let current = node
  let slot = getContextSlot(tree, current)
  while (passesTruthiness(slot)) {
    current = slot.parent
    slot = getContextSlot(tree, current)
  }

  let { parent, index, key } = slot
  switch (parent?.type) {
    case 'ArrowFunctionExpression':
      return (
        key === 'body' && parent.expression && isPredicateCallback(tree, parent)
      )
    case 'ConditionalExpression':
    case 'DoWhileStatement':
    case 'WhileStatement':
    case 'ForStatement':
    case 'IfStatement':
      return key === 'test'
    case 'ReturnStatement': {
      let enclosing = getEnclosingFunction(tree, parent)
      return enclosing !== null && isPredicateCallback(tree, enclosing)
    }
    case 'UnaryExpression':
      return parent.operator === '!'
    case 'CallExpression': {
      let callee = unwrapExpression(parent.callee)
      return (
        index === 0 &&
        current.type !== 'SpreadElement' &&
        callee.type === 'Identifier' &&
        callee.name === 'Boolean' &&
        !scopes.bindings.has(callee)
      )
    }
    default:
      return false
  }
}

/**
 * Tells whether a function is the first argument of a call of `every`,
 * `filter`, `find`, `findIndex`, `findLast`, `findLastIndex` or `some`.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Function of the runtime tree.
 * @returns Whether only the truthiness of what the function returns is used.
 */
function isPredicateCallback(tree: TreeIndex, node: Node): boolean {
  let { parent, index } = getContextSlot(tree, node)
  if (index !== 0 || parent?.type !== 'CallExpression') {
    return false
  }
  let callee = unwrapExpression(parent.callee)
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    predicateMethods.has(callee.property.name)
  )
}
