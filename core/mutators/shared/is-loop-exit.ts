import type { ContinueStatement, BreakStatement, Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'
import type { NodeSlot } from '../../../types/syntax/node-slot'
import type { RunningValue } from './get-running-value'

/**
 * Loop that decides with a test whether to run its body again.
 */
type TestedLoop = RunningValue['loop']

/**
 * Statements that an unlabeled `break` leaves.
 */
let breakableTypes = new Set([
  'DoWhileStatement',
  'SwitchStatement',
  'ForOfStatement',
  'ForInStatement',
  'WhileStatement',
  'ForStatement',
])

/**
 * Tells whether a statement of a loop leaves it: a `return`, a `throw` unless
 * the block of a `try` with a `catch` inside the loop holds it, and a `break`
 * or `continue` that leaves the loop (see `leavesByJump`). A jump in a
 * `finally` block that cancels such a statement is not taken into account.
 *
 * @param node - Node inside the loop, outside nested functions.
 * @param loop - Loop around the node.
 * @param context - Mutator context of the file.
 * @returns Whether the node leaves the loop.
 */
export function isLoopExit(
  node: Node,
  loop: TestedLoop,
  context: MutatorContext,
): boolean {
  switch (node.type) {
    case 'ContinueStatement':
    case 'BreakStatement':
      return leavesByJump(node, loop, context)
    case 'ReturnStatement':
      return true
    case 'ThrowStatement':
      return getSlotsInside(node, loop, context).every(
        ({ parent, key }) =>
          parent?.type !== 'TryStatement' ||
          key !== 'block' ||
          parent.handler === null,
      )
    default:
      return false
  }
}

/**
 * Tells whether a `break` or `continue` leaves a loop around it. A `break`
 * leaves it unless its target, the nearest loop or `switch` or the statement
 * with its label, is inside the loop. A labeled `continue` leaves it unless its
 * label is on a statement inside the loop or on the loop itself; an unlabeled
 * one never does.
 *
 * @param jump - Break or continue statement inside the loop.
 * @param loop - Loop around the statement.
 * @param context - Mutator context of the file.
 * @returns Whether the statement leaves the loop.
 */
function leavesByJump(
  jump: ContinueStatement | BreakStatement,
  loop: TestedLoop,
  context: MutatorContext,
): boolean {
  let { label } = jump
  if (!label) {
    return (
      jump.type === 'BreakStatement' &&
      getSlotsInside(jump, loop, context).every(
        ({ parent }) => !breakableTypes.has(parent!.type),
      )
    )
  }
  let inside = getSlotsInside(jump, loop, context).some(
    ({ parent }) =>
      parent?.type === 'LabeledStatement' && parent.label.name === label.name,
  )
  return (
    !inside &&
    (jump.type === 'BreakStatement' ||
      !getOwnLabels(loop, context).has(label.name))
  )
}

/**
 * Collects the labels of a loop: those of the labeled statements right around
 * it.
 *
 * @param loop - Loop to read.
 * @param context - Mutator context of the file.
 * @returns The names of the loop's labels.
 */
function getOwnLabels(loop: TestedLoop, context: MutatorContext): Set<string> {
  let labels = new Set<string>()
  let { parent } = context.syntax.getContextSlot(loop)
  while (parent?.type === 'LabeledStatement') {
    labels.add(parent.label.name)
    ;({ parent } = context.syntax.getContextSlot(parent))
  }
  return labels
}

/**
 * Collects the slots of a node and of its ancestors whose parents lie inside a
 * loop around the node.
 *
 * @param node - Node inside the loop.
 * @param loop - Loop around the node.
 * @param context - Mutator context of the file.
 * @returns The slots from the node's own one outward; the parent of each is a
 *   statement or expression between the node and the loop.
 */
function getSlotsInside(
  node: Node,
  loop: TestedLoop,
  context: MutatorContext,
): NodeSlot[] {
  let slots: NodeSlot[] = []
  let slot = context.syntax.getContextSlot(node)
  while (slot.parent !== loop) {
    slots.push(slot)
    slot = context.syntax.getContextSlot(slot.parent!)
  }
  return slots
}
