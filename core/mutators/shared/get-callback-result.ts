import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'
import type { CallbackOwner } from './get-callback-owner'
import type { ReturnSwitch } from './get-return-switch'

import { getCallbackOwner } from './get-callback-owner'
import { getReturnSwitch } from './get-return-switch'
import { getNegationTop } from './get-negation-top'
import { isWholeBody } from './is-whole-body'

/**
 * Decision of a no-op callback that a node makes, through its `!` chain.
 */
export interface CallbackResult {
  /**
   * Return switch whose test the node is, or null when the node is the result
   * itself.
   */
  returnSwitch: ReturnSwitch | null

  /**
   * Method that calls the callback.
   */
  owner: CallbackOwner

  /**
   * Whether an odd number of `!` lies between the node and the decision.
   */
  negated: boolean
}

/**
 * Finds the no-op callback whose result a node decides (catalog 2.2, O12). The
 * node, or the top of its `!` chain, is the result of a comparator of `sort` or
 * `toSorted` (its concise body, or the argument of a `return` that is its whole
 * block body), or the test of a return switch that is its whole block body. A
 * callback that runs other statements keeps running them under a constant
 * result, so that constant is not the same as removing the call.
 *
 * @param node - Node of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns The callback's owner, the parity of the `!` chain and the return
 *   switch, or null.
 */
export function getCallbackResult(
  node: Node,
  context: MutatorContext,
): CallbackResult | null {
  let top = getNegationTop(node, context)
  let { parent, key } = context.syntax.getContextSlot(top.node)
  let enclosing =
    parent?.type === 'ArrowFunctionExpression' ?
      parent
    : context.syntax.getEnclosingFunction(top.node)
  if (!enclosing) {
    return null
  }
  let returnSwitch =
    key === 'test' && parent?.type === 'IfStatement' ?
      getReturnSwitch(enclosing)
    : null
  let decides =
    (parent === enclosing && key === 'body') ||
    ((parent?.type === 'ReturnStatement' ||
      returnSwitch?.statement === parent) &&
      isWholeBody(enclosing, parent))
  let owner = decides ? getCallbackOwner(enclosing, context) : null
  return owner ?
      { negated: top.negations % 2 === 1, returnSwitch, owner }
    : null
}
