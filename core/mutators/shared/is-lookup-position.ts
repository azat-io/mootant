import type { CallExpression } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

import { isBooleanResultSource } from './is-boolean-result-source'
import { isBooleanModeOperand } from './is-boolean-mode-operand'
import { isComparisonOperand } from './is-comparison-operand'
import { isBooleanResult } from './is-boolean-result'
import { getCallTop } from './get-call-top'

/**
 * Tells whether the value of a lookup call is only used as a decision whose
 * owner emits its constants (catalog O8, 4.9 and 4.16): the call, or the root
 * of the optional chain whose top it is, is in a boolean context, a
 * boolean-mode operand, a comparison operand, a boolean result or the source of
 * a local that a boolean result returns.
 *
 * @param call - Call of a lookup method or of `Object.hasOwn`.
 * @param context - Mutator context of the file.
 * @returns Whether the lookup is in such a position.
 */
export function isLookupPosition(
  call: CallExpression,
  context: MutatorContext,
): boolean {
  let top = getCallTop(call, context)
  return (
    context.syntax.isBooleanContext(top) ||
    isBooleanModeOperand(top, context) ||
    isComparisonOperand(top, context) ||
    isBooleanResult(top, context) ||
    isBooleanResultSource(top, context)
  )
}
