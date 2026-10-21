import type { Node } from 'oxc-parser'

import type { NodeSlot } from '../../types/syntax/node-slot'

/**
 * Tells whether only the truthiness of the node in a slot is used exactly when
 * only that of its parent is: an operand of `&&` or `||`, the right operand of
 * `??`, a branch of `?:` or the last expression of a sequence.
 *
 * @param slot - Context slot of a node.
 * @returns Whether the question moves on to the parent.
 */
export function passesTruthiness(
  slot: NodeSlot,
): slot is { parent: Node } & NodeSlot {
  let { parent, index, key } = slot
  switch (parent?.type) {
    case 'ConditionalExpression':
      return key !== 'test'
    case 'SequenceExpression':
      return index === parent.expressions.length - 1
    case 'LogicalExpression':
      return parent.operator !== '??' || key === 'right'
    default:
      return false
  }
}
