import type { IfStatement, Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'
import type { NodeSlot } from '../../../types/syntax/node-slot'
import type { RunningValue } from './get-running-value'

import { getRunningValue } from './get-running-value'
import { isFunction } from '../../syntax/is-function'
import { walkTree } from '../../tree/walk-tree'
import { isLoopExit } from './is-loop-exit'
import { isNegation } from './is-negation'
import { isAndOr } from './is-and-or'

/**
 * Finds the value of a node that may keep its loop running forever (catalog
 * 2.2, TIMEOUT). In a loop test that is its running value (see
 * `getRunningValue`), whatever else can end the loop. In an exit test it is its
 * running value only while one of the loops that the test's `if` leaves (see
 * `getExitedLoops`) has no other way out: no operand next to the node can end
 * the loop on its own, as `b` can in `if (a || b) break`, and no `break`,
 * `continue`, `return` or `throw` of the loop's update or body leaves it (see
 * `isLoopExit`), apart from the consequent of the `if`, nested functions and
 * values of instance fields, which run only when the class is instantiated.
 * Calls, `await` and `yield` do not count: nearly every loop has them, and they
 * rarely end it.
 *
 * @param node - Node of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns The value that may keep the loop running forever, or null.
 */
export function getEndlessValue(
  node: Node,
  context: MutatorContext,
): boolean | null {
  let running = getRunningValue(node, context)
  if (!running) {
    return null
  }
  let { value } = running
  let operandExit = false
  let { parent, key } = context.syntax.getContextSlot(node)
  while (key !== 'test') {
    if (isNegation(parent)) {
      value = !value
    } else if (isAndOr(parent) && (parent.operator === '&&') === value) {
      operandExit = true
    }
    ;({ parent, key } = context.syntax.getContextSlot(parent!))
  }
  if (parent?.type !== 'IfStatement') {
    return running.value
  }
  let exit = parent
  let endless =
    !operandExit &&
    context.syntax
      .getExitedLoops(exit)
      .some(loop => !hasOtherJump(loop, exit, context))
  return endless ? running.value : null
}

/**
 * Tells whether a statement other than the consequent of an exit test's `if`
 * leaves a loop that the `if` leaves: a statement of the loop's update or body
 * outside that consequent, nested functions, values of instance fields and code
 * that the runtime tree leaves out, such as decorators (see `isLoopExit`).
 *
 * @param loop - Loop that the `if` leaves.
 * @param exit - If statement of the exit test.
 * @param context - Mutator context of the file.
 * @returns Whether another statement leaves the loop.
 */
function hasOtherJump(
  loop: RunningValue['loop'],
  exit: IfStatement,
  context: MutatorContext,
): boolean {
  return [loop.type === 'ForStatement' ? loop.update : null, loop.body].some(
    part => {
      let found = false
      if (part) {
        walkTree(part, (child, slot) => {
          if (
            found ||
            child === exit.consequent ||
            isFunction(child) ||
            isInstanceFieldValue(slot) ||
            !context.syntax.isRuntimeNode(child)
          ) {
            return false
          }
          found = isLoopExit(child, loop, context)
          return !found
        })
      }
      return found
    },
  )
}

/**
 * Tells whether a node is the value of a class field that is not static, which
 * runs when an instance is created, not when the class is defined.
 *
 * @param slot - Raw slot of the node.
 * @returns Whether the node is the value of an instance field or accessor.
 */
function isInstanceFieldValue({ parent, key }: NodeSlot): boolean {
  return (
    key === 'value' &&
    (parent?.type === 'PropertyDefinition' ||
      parent?.type === 'AccessorProperty') &&
    !parent.static
  )
}
