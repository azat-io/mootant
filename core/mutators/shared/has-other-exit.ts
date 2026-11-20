import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'
import type { RunningValue } from './get-running-value'

import { isFunction } from '../../syntax/is-function'
import { walkTree } from '../../tree/walk-tree'
import { isLoopExit } from './is-loop-exit'
import { isNegation } from './is-negation'
import { isAndOr } from './is-and-or'

/**
 * Loop that decides with a test whether to run its body again.
 */
type TestedLoop = RunningValue['loop']

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
 * Tells whether a node of a loop may leave it: a node of `leavingTypes`, or a
 * `break` or `continue` that leaves the loop (see `isLoopExit`). A `throw`
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
  return leavingTypes.has(node.type) || isLoopExit(node, loop, context)
}
