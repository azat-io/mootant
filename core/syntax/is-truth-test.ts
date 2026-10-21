import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'

import { getContextSlot } from '../tree/get-context-slot'
import { passesTruthiness } from './passes-truthiness'

/**
 * Tells whether the code around a node only tests the truth of its value: the
 * node is the test of a condition or a loop or the operand of `!`, directly or
 * as an operand of `&&` or `||`, the right operand of `??`, a branch of `?:` or
 * the last expression of a sequence whose value is so tested. Unlike
 * `isBooleanContext`, it rests on no name: neither the result of a callback of
 * a method named like an array predicate nor the argument of `Boolean` counts.
 * Parentheses and TypeScript expression wrappers are looked through.
 *
 * @param tree - Runtime tree of the program.
 * @param node - Node of the runtime tree.
 * @returns Whether only the truth of the value of the node is used.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isTruthTest(tree: TreeIndex, node: Node): boolean {
  let slot = getContextSlot(tree, node)
  while (passesTruthiness(slot)) {
    slot = getContextSlot(tree, slot.parent)
  }
  let { parent, key } = slot
  switch (parent?.type) {
    case 'ConditionalExpression':
    case 'DoWhileStatement':
    case 'WhileStatement':
    case 'ForStatement':
    case 'IfStatement':
      return key === 'test'
    case 'UnaryExpression':
      return parent.operator === '!'
    default:
      return false
  }
}
