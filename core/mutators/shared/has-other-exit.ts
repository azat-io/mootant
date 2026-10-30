import type { ContinueStatement, BreakStatement, Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'
import type { NodeSlot } from '../../../types/syntax/node-slot'
import type { RunningValue } from './get-running-value'

import { isFunction } from '../../syntax/is-function'
import { walkTree } from '../../tree/walk-tree'
import { isNegation } from './is-negation'
import { isAndOr } from './is-and-or'

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
 * Nodes that may leave a loop wherever they are in it: `return`, `throw`,
 * `yield`, after which the caller may never resume the loop, and calls, `new`,
 * tagged templates, `import()` and `await`, which run code the loop does not
 * show: that code may throw, or change what the condition reads.
 */
let leavingTypes = new Set([
  'TaggedTemplateExpression',
  'ImportExpression',
  'AwaitExpression',
  'ReturnStatement',
  'YieldExpression',
  'CallExpression',
  'ThrowStatement',
  'NewExpression',
])

/**
 * Tells whether a loop can end other than through a node of its condition,
 * while the node keeps its running value: an operand next to the node can end
 * the loop on its own (`b` in `while (a && b)` or in `if (a || b) break`), or
 * the test, the update or the body of the loop holds a node that may leave it
 * (see `leavesLoop`), such as a `break` or a call. For an exit test, the
 * consequent of its own `if` does not count. Nested functions are not entered.
 * Getters, setters, conversions and iterators are not known, so they do not
 * count.
 *
 * @param node - Node of a loop condition.
 * @param running - Running value of the node, with its loop.
 * @param context - Mutator context of the file.
 * @returns Whether something else can end the loop.
 */
export function hasOtherExit(
  node: Node,
  running: RunningValue,
  context: MutatorContext,
): boolean {
  let { syntax } = context
  let { value, loop } = running
  let { parent, key } = syntax.getContextSlot(node)
  while (
    key !== 'test' ||
    (parent !== loop && parent?.type !== 'IfStatement')
  ) {
    if (isNegation(parent)) {
      value = !value
    } else if (isAndOr(parent) && (parent.operator === '&&') === value) {
      return true
    }
    ;({ parent, key } = syntax.getContextSlot(parent!))
  }
  let own = parent.type === 'IfStatement' ? parent.consequent : null
  return [
    loop.test,
    loop.type === 'ForStatement' ? loop.update : null,
    loop.body,
  ].some(part => {
    let found = false
    if (part) {
      walkTree(part, child => {
        if (
          found ||
          child === own ||
          isFunction(child) ||
          !syntax.isRuntimeNode(child)
        ) {
          return false
        }
        found = leavesLoop(child, loop, context)
        return !found
      })
    }
    return found
  })
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

/**
 * Tells whether a node of a loop may leave it: a node of `leavingTypes`, or a
 * `break` or `continue` that leaves the loop (see `leavesByJump`). A `throw`
 * counts even inside a `try` with a `catch`.
 *
 * @param node - Node inside the loop, outside nested functions.
 * @param loop - Loop around the node.
 * @param context - Mutator context of the file.
 * @returns Whether the node may leave the loop.
 */
function leavesLoop(
  node: Node,
  loop: TestedLoop,
  context: MutatorContext,
): boolean {
  if (node.type === 'ContinueStatement' || node.type === 'BreakStatement') {
    return leavesByJump(node, loop, context)
  }
  return leavingTypes.has(node.type)
}
