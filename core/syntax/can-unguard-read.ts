import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'

import { getContextSlot } from '../tree/get-context-slot'
import { isStatement } from './is-statement'
import { walkTree } from '../tree/walk-tree'
import { isFunction } from './is-function'

/**
 * Operators of a binary expression that throw when the right operand is not an
 * object or not callable.
 */
let checkingOperators = new Set(['instanceof', 'in'])

/**
 * Tells whether a replacement inside an expression can make it throw where the
 * original does not, because it takes away the guard of a read that throws on a
 * nullish value: a member read (`a.b`, `a[k]`) or the right operand of `in` and
 * `instanceof`. The rule is structural and does not depend on the mutator. The
 * replacement can unguard a read when, on the way from the replaced node up to
 * the call argument, statement or function around it, the value of the node
 * becomes the object of a member read that is not optional or the right operand
 * of `in` or `instanceof` (`delays[0].ms` with `0` replaced), or the left
 * operand of a logical expression or the test of a conditional expression whose
 * guarded operands hold a read (`options && options.delay`, `options != null ?
 * Options.delay : 0` with the test replaced). A guard whose test or left
 * operand holds a type check (`typeof`, `in`, `instanceof`) also guards every
 * operand that is not a literal, since such a check can keep an undeclared
 * global from a `ReferenceError` or a BigInt or a Symbol from a `TypeError`
 * (`typeof DELAY === 'number' ? DELAY : 1000`). It can also unguard a read when
 * the replaced node holds such a guard, or an optional member read, and the
 * replacement text keeps the guarded operand, or the object of the optional
 * read, without the guard around it (`options && options.delay` to
 * `options.delay`, `a?.b` to `a.b`). A replacement that keeps the guard in its
 * text (`(a?.b ?? 1) * 1000` to `(a?.b ?? 1) / 1000`), or that only changes
 * values no read depends on (`1000` to `1001`, `base * 2` to `base / 2`),
 * cannot. A replacement that drops a read which throws in the original does not
 * count. Getters and conversions are not known, so they do not count.
 *
 * @param tree - Runtime tree of the file.
 * @param replacement - Replaced node and the text written in its place.
 * @param replacement.node - Replaced node.
 * @param replacement.text - Text written in place of the node.
 * @param source - Text of the file that node offsets refer to.
 * @returns Whether the replacement can make a guarded read throw.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function canUnguardRead(
  tree: TreeIndex,
  replacement: { text: string; node: Node },
  source: string,
): boolean {
  let { node, text } = replacement
  let current = node
  while (!isStatement(current) && !isFunction(current)) {
    let { parent, key } = getContextSlot(tree, current)
    if (parent === null || key === 'arguments') {
      break
    }
    if (isGuardSlot(parent, key)) {
      return true
    }
    current = parent
  }
  let unguarded = false
  walkTree(node, child => {
    let guarded = getGuardedOperands(child)
    if (
      guarded.length > 0 &&
      !text.includes(source.slice(child.start, child.end)) &&
      guarded.some(operand =>
        text.includes(source.slice(operand.start, operand.end)),
      )
    ) {
      unguarded = true
    }
    return !unguarded
  })
  return unguarded
}

/**
 * Tells whether a change of the value in a slot of a node can make a read
 * throw: the object of a member read that is not optional, the right operand of
 * `in` or `instanceof`, or the guard of operands that hold a read.
 *
 * @param parent - Node that holds the value.
 * @param key - Property of the node that holds the value.
 * @returns Whether a change of the value can make a read throw.
 */
function isGuardSlot(parent: Node, key: string | null): boolean {
  switch (parent.type) {
    case 'ConditionalExpression':
      return key === 'test' && getGuardedOperands(parent).length > 0
    case 'LogicalExpression':
      return key === 'left' && getGuardedOperands(parent).length > 0
    case 'BinaryExpression':
      return key === 'right' && checkingOperators.has(parent.operator)
    case 'MemberExpression':
      return key === 'object' && !parent.optional
    default:
      return false
  }
}

/**
 * Lists the operands that a guard keeps from throwing: the right operand of a
 * logical expression or a branch of a conditional expression that holds a read,
 * or the object of an optional member read.
 *
 * @param node - Node to check.
 * @returns Guarded operands, empty when the node guards no read.
 */
function getGuardedOperands(node: Node): Node[] {
  switch (node.type) {
    case 'ConditionalExpression':
      return [node.consequent, node.alternate].filter(operand =>
        isGuarded(node.test, operand),
      )
    case 'LogicalExpression':
      return isGuarded(node.left, node.right) ? [node.right] : []
    case 'MemberExpression':
      return node.optional ? [node.object] : []
    default:
      return []
  }
}

/**
 * Tells whether an expression holds a type check: a `typeof` expression or an
 * `in` or `instanceof` expression.
 *
 * @param node - Expression to check.
 * @returns Whether the expression holds a type check.
 */
function hasTypeCheck(node: Node): boolean {
  let found = false
  walkTree(node, child => {
    if (
      (child.type === 'UnaryExpression' && child.operator === 'typeof') ||
      (child.type === 'BinaryExpression' &&
        checkingOperators.has(child.operator))
    ) {
      found = true
    }
    return !found
  })
  return found
}

/**
 * Tells whether an expression holds a read that throws on a nullish value: a
 * member read or the right operand of `in` or `instanceof`.
 *
 * @param node - Expression to check.
 * @returns Whether the expression holds such a read.
 */
function hasRead(node: Node): boolean {
  let found = false
  walkTree(node, child => {
    if (
      child.type === 'MemberExpression' ||
      (child.type === 'BinaryExpression' &&
        checkingOperators.has(child.operator))
    ) {
      found = true
    }
    return !found
  })
  return found
}

/**
 * Tells whether a check keeps an operand from throwing: the operand holds a
 * read, or the check holds a type check and the operand is not a literal. A
 * type check (`typeof`, `in`, `instanceof`) can keep an undeclared global from
 * a `ReferenceError`, or a BigInt or a Symbol from arithmetic, a template or
 * the delay itself, where it throws a `TypeError`.
 *
 * @param check - Test of a conditional expression or left operand of a logical
 *   expression.
 * @param operand - Operand that the check guards.
 * @returns Whether the check guards the operand.
 */
function isGuarded(check: Node, operand: Node): boolean {
  return hasRead(operand) || (operand.type !== 'Literal' && hasTypeCheck(check))
}
