import type { TreeIndex } from '../../types/syntax/tree-index'
import type { NodeSlot } from '../../types/syntax/node-slot'

/**
 * Parents whose `left` is assigned to.
 */
let assignedLeftTypes = new Set([
  'AssignmentExpression',
  'AssignmentPattern',
  'ForOfStatement',
  'ForInStatement',
])

/**
 * Parents whose operand is assigned to.
 */
let assignedOperandTypes = new Set([
  'UpdateExpression',
  'ArrayPattern',
  'RestElement',
])

/**
 * Tells whether a node is assigned to: the target of an assignment, of a loop
 * head or of an update, or a part of a destructuring pattern.
 *
 * @param tree - Runtime tree of the file.
 * @param context - Context slot of an expression, which always has a parent.
 * @returns Whether the expression is a write target.
 */
export function isWriteTarget(tree: TreeIndex, context: NodeSlot): boolean {
  let { key } = context
  let parent = context.parent!
  if (key === 'left' && assignedLeftTypes.has(parent.type)) {
    return true
  }
  if (assignedOperandTypes.has(parent.type)) {
    return true
  }
  return (
    parent.type === 'Property' &&
    key === 'value' &&
    tree.slots.get(parent)!.parent!.type === 'ObjectPattern'
  )
}
