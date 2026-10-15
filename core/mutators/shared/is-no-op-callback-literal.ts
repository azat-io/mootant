import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

import { getCallbackOwner } from './get-callback-owner'
import { getReturnSwitch } from './get-return-switch'
import { getLiteralValue } from './get-literal-value'
import { emptiesCallback } from './empties-callback'
import { isWholeBody } from './is-whole-body'

/**
 * Tells whether giving a branch literal of a return switch a new value makes a
 * comparator of an in-place `sort` a no-op (catalog 2.2, O12): the switch is
 * the whole block body of the callback and after the change both literals of
 * the switch empty the callback, so every call returns such a value. Such a
 * mutant belongs to method-call's removal of the call.
 *
 * @param node - Literal that a literal mutator would replace.
 * @param value - Value the literal mutator gives it.
 * @param context - Mutator context of the file.
 * @returns Whether the literal mutant has the behavior of the removed call.
 */
export function isNoOpCallbackLiteral(
  node: Node,
  value: unknown,
  context: MutatorContext,
): boolean {
  let { parent } = context.sourceCode.getSlot(node)
  if (parent?.type !== 'ReturnStatement') {
    return false
  }
  let enclosing = context.syntax.getEnclosingFunction(parent)
  let returnSwitch = enclosing ? getReturnSwitch(enclosing) : null
  let owner = enclosing ? getCallbackOwner(enclosing, context) : null
  if (
    !returnSwitch ||
    !owner ||
    !isWholeBody(enclosing!, returnSwitch.statement)
  ) {
    return false
  }
  let { consequent, alternate } = returnSwitch
  return (
    emptiesCallback(
      owner,
      consequent === node ? value : getLiteralValue(consequent),
    ) &&
    emptiesCallback(
      owner,
      alternate === node ? value : getLiteralValue(alternate),
    )
  )
}
