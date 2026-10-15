import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

import { getCallbackResult } from './get-callback-result'
import { getLiteralValue } from './get-literal-value'
import { emptiesCallback } from './empties-callback'

/**
 * Tells whether replacing a node with a boolean constant makes a comparator of
 * an in-place `sort` a no-op (catalog 2.2, O12): the node, through its `!`
 * chain, is the callback's result and the constant empties it, or the test of
 * its return switch and the constant selects a literal that empties it. Such a
 * mutant belongs to method-call's removal of the call.
 *
 * @param node - Node a constant would replace.
 * @param value - Truth value written in place of the node.
 * @param context - Mutator context of the file.
 * @returns Whether the constant has the behavior of the removed call.
 */
export function isNoOpCallbackConstant(
  node: Node,
  value: boolean,
  context: MutatorContext,
): boolean {
  let result = getCallbackResult(node, context)
  if (!result) {
    return false
  }
  let forced = value !== result.negated
  let { returnSwitch, owner } = result
  if (!returnSwitch) {
    return emptiesCallback(owner, forced)
  }
  return emptiesCallback(
    owner,
    getLiteralValue(forced ? returnSwitch.consequent : returnSwitch.alternate),
  )
}
