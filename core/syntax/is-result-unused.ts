import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'

import { getContextSlot } from '../tree/get-context-slot'

/**
 * Tells whether the value of an expression is discarded: it is an expression
 * statement, the `init` or `update` of a `for` loop, the operand of `void`, or
 * an expression of a sequence other than the last. The last expression of a
 * sequence is discarded when the sequence is. Parentheses and TypeScript
 * expression wrappers are looked through.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns Whether nothing reads the value of the node.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isResultUnused(tree: TreeIndex, node: Node): boolean {
  let slot = getContextSlot(tree, node)
  while (
    slot.parent?.type === 'SequenceExpression' &&
    slot.index === slot.parent.expressions.length - 1
  ) {
    slot = getContextSlot(tree, slot.parent)
  }

  let { parent, key } = slot
  switch (parent?.type) {
    case 'ExpressionStatement':
    case 'SequenceExpression':
      return true
    case 'UnaryExpression':
      return parent.operator === 'void'
    case 'ForStatement':
      return key === 'init' || key === 'update'
    default:
      return false
  }
}
