import type { Node } from 'oxc-parser'

import type { ScopeAnalysis } from '../../types/syntax/scope-analysis'
import type { TreeIndex } from '../../types/syntax/tree-index'

import { getContextSlot } from '../tree/get-context-slot'
import { readTimerCall } from './read-timer-call'
import { isEffectFree } from './is-effect-free'
import { isStatement } from './is-statement'
import { isFunction } from './is-function'

/**
 * Tells whether a node is the delay argument of a known timer call, or part of
 * it, and the delay is free of effects (`setTimeout(run, 100)`, `seconds` and
 * `1000` in `setInterval(tick, seconds * 1000)`, `await setTimeout(500)` of
 * `node:timers/promises`). A change there only changes when the timer fires. A
 * delay with a call, an assignment or another effect is not one, since a change
 * inside it can change what runs; nor is an argument after a spread, whose
 * position is unknown. The walk up stops at the first call argument, statement
 * or function.
 *
 * @param tree - Runtime tree of the file.
 * @param scopes - Scope analysis of the file.
 * @param node - Node of the runtime tree.
 * @returns Whether the node lies in an effect-free timer delay.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isTimerDelay(
  tree: TreeIndex,
  scopes: ScopeAnalysis,
  node: Node,
): boolean {
  let current = node
  while (!isStatement(current) && !isFunction(current)) {
    let { parent, index, key } = getContextSlot(tree, current)
    if (parent === null) {
      return false
    }
    if (key === 'arguments') {
      if (parent.type !== 'CallExpression') {
        return false
      }
      let position = index!
      let { arguments: list } = parent
      return (
        readTimerCall(scopes, parent)?.delay === position &&
        list
          .slice(0, position)
          .every(argument => argument.type !== 'SpreadElement') &&
        isEffectFree(list[position]!)
      )
    }
    current = parent
  }
  return false
}
