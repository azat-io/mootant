import type { Node } from 'oxc-parser'

import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'
import type { TreeIndex } from '../../types/syntax/tree-index'

import { getContextSlot } from '../tree/get-context-slot'
import { readTimerCall } from './read-timer-call'

/**
 * Operators of a binary expression that only compute a number or join a string
 * from their operands.
 */
let arithmeticOperators = new Set(['**', '%', '*', '+', '-', '/'])

/**
 * Tells whether the value of a node only reaches the delay argument of a known
 * timer call (`setTimeout(run, 100)`, `seconds` and `1000` in
 * `setInterval(tick, seconds * 1000)`, `await setTimeout(500)` of
 * `node:timers/promises`). On the way up to the delay the value may only pass
 * through parentheses and TypeScript wrappers, unary `+` and `-`, an operand of
 * an arithmetic operator, a branch of a conditional expression and the right
 * operand of a logical expression: positions where the value decides nothing
 * but the result. The test of a conditional, the left operand of a logical
 * expression, the object or key of a member read, a call argument and every
 * other position stop the walk, since there the value can decide what runs. An
 * argument after a spread, whose position is unknown, is not a delay.
 *
 * @param tree - Runtime tree of the file.
 * @param scopes - Scope analysis of the file.
 * @param node - Node of the runtime tree.
 * @returns Whether the value of the node only reaches a timer delay.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isTimerDelay(
  tree: TreeIndex,
  scopes: ScopeAnalysis,
  node: Node,
): boolean {
  let current = node
  for (;;) {
    let { parent, index, key } = getContextSlot(tree, current)
    if (parent === null) {
      return false
    }
    switch (parent.type) {
      case 'ConditionalExpression':
        if (key === 'test') {
          return false
        }
        break
      case 'LogicalExpression':
        if (key !== 'right') {
          return false
        }
        break
      case 'BinaryExpression':
        if (!arithmeticOperators.has(parent.operator)) {
          return false
        }
        break
      case 'UnaryExpression':
        if (parent.operator !== '+' && parent.operator !== '-') {
          return false
        }
        break
      case 'CallExpression': {
        if (key !== 'arguments') {
          return false
        }
        let position = index!
        return (
          readTimerCall(scopes, parent)?.delay === position &&
          parent.arguments
            .slice(0, position)
            .every(argument => argument.type !== 'SpreadElement')
        )
      }
      default:
        return false
    }
    current = parent
  }
}
