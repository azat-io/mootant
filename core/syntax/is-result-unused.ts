import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'

import { getResultSlot } from './get-result-slot'

/**
 * Tells whether the value of an expression is discarded: it is an expression
 * statement, the `init` or `update` of a `for` loop, the operand of `void`, an
 * expression of a sequence other than the last, or the expression body of an
 * arrow function whose result is discarded, such as an event handler of a
 * component template. The last expression of a sequence is discarded when the
 * sequence is. Parentheses and TypeScript expression wrappers are looked
 * through.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @param discarded - Arrow functions whose result nothing reads; none when
 *   omitted.
 * @returns Whether nothing reads the value of the node.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isResultUnused(
  tree: TreeIndex,
  node: Node,
  discarded: ReadonlySet<Node> = new Set(),
): boolean {
  let { parent, key } = getResultSlot(tree, node)
  switch (parent?.type) {
    case 'ArrowFunctionExpression':
      return key === 'body' && discarded.has(parent)
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
