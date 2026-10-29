import type { Node } from 'oxc-parser'

import type { LiteralChange } from '../../../types/syntax/literal-change'
import type { SkipNote } from '../../../types/mutant/skip-note'
import type { RunContext } from './create-run-context'

import { isNoOpCallbackLiteral } from './is-no-op-callback-literal'
import { isBooleanModeOperand } from './is-boolean-mode-operand'
import { isComparisonOperand } from './is-comparison-operand'
import { NO_OP_CALLBACK_SKIP } from './no-op-callback-skip'
import { getBranchCopySkip } from './get-branch-copy-skip'
import { getLiteralMutator } from './get-literal-mutator'
import { getShiftedLiteral } from './get-shifted-literal'
import { getOrDefaultSkip } from './get-or-default-skip'
import { getRunningValue } from './get-running-value'
import { getNegationTop } from './get-negation-top'
import { isVoidOperand } from './is-void-operand'

/**
 * Change of a literal and the rules of its own mutator.
 */
interface LiteralSkipQuery {
  /**
   * Rules of the literal's own mutator, checked after the operand and error
   * message rules; omitted when the mutator has none.
   */
  getOwnSkip?(): SkipNote | null

  /**
   * New value of the literal, or new text of a template with expressions.
   */
  change: LiteralChange
}

/**
 * Decides whether a literal mutator skips a change of a literal for a rule that
 * all literal mutators share (catalog 2.8, 4.5, 4.11, 4.16): the literal is an
 * operand of a comparison (shifted-literal, O4; see `getComparisonOperandSkip`)
 * or of a boolean-mode `&&` or `||` (O3) or, whose change is invisible, of
 * `void` (EQ), a string is an error message (NOISE), a boolean or number change
 * gives a loop its running value unless the `timeouts` setting is on (TIMEOUT),
 * the change copies the other branch of a branch pair (O19, R5), makes a no-op
 * callback (O12) or empties a `||` default (O16, R7). A template with
 * expressions, which changes only its text, is checked against the first four
 * and the branch copy. The rules of the literal's own mutator are checked right
 * after the operand and error message rules.
 *
 * @param node - Literal that a literal mutator would replace.
 * @param query - Change of the literal and the rules of its own mutator.
 * @param context - Mutator context with the test of mutants that will run.
 * @returns Rule and reason of the skip, or null when no rule skips the change.
 */
export function getLiteralSkip(
  node: Node,
  query: LiteralSkipQuery,
  context: RunContext,
): SkipNote | null {
  let { getOwnSkip, change } = query
  let mutator = getLiteralMutator(node)
  let operandSkip =
    isComparisonOperand(node, context) ?
      getComparisonOperandSkip(node, mutator!, context)
    : null
  if (operandSkip) {
    return operandSkip
  }
  if (isBooleanModeOperand(node, context)) {
    return {
      by: {
        node: getOperandParent(node, context),
        mutator: 'logical-operator',
      },
      reason: 'logical-operator owns the truth value of an operand of && or ||',
      rule: 'O3',
    }
  }
  if (isVoidOperand(node, context)) {
    return {
      reason: 'the value of a void expression is always undefined',
      rule: 'void-operand',
    }
  }
  if (mutator === 'string-literal' && context.syntax.isErrorMessage(node)) {
    return {
      reason: 'the text of an error message is not worth a test',
      rule: 'error-message',
    }
  }
  let own = getOwnSkip?.() ?? null
  if (own) {
    return own
  }
  if (!('value' in change)) {
    return getBranchCopySkip(node, change, context)
  }
  let { value } = change
  if (
    mutator !== 'string-literal' &&
    !context.settings.timeouts &&
    getRunningValue(node, context)?.value === Boolean(value)
  ) {
    return {
      reason:
        'the new value keeps the loop running forever, so only a timeout could kill it',
      rule: 'loop-running',
    }
  }
  let copy = getBranchCopySkip(node, change, context)
  if (copy) {
    return copy
  }
  if (isNoOpCallbackLiteral(node, value, context)) {
    return NO_OP_CALLBACK_SKIP
  }
  return getOrDefaultSkip(node, value, context)
}

/**
 * Decides whether a literal mutator skips the change of a literal operand of a
 * comparison (catalog 11.2). When comparison-operator shifts the literal one
 * step up, number-literal's change of it is that shifted literal under another
 * name, so it is skipped whatever runs (shifted-literal). Any other change is
 * subsumed by a comparison-operator mutant that changes the comparison on part
 * of the inputs where it does, so it is skipped only while comparison-operator
 * will run on the comparison (O4).
 *
 * @param node - Literal operand of a comparison.
 * @param mutator - Id of the literal's mutator.
 * @param context - Mutator context with the test of mutants that will run.
 * @returns Rule and reason of the skip, or null when the change is the only
 *   probe of the comparison left.
 */
function getComparisonOperandSkip(
  node: Node,
  mutator: string,
  context: RunContext,
): SkipNote | null {
  let by = {
    node: getOperandParent(node, context),
    mutator: 'comparison-operator',
  }
  let shifted = getShiftedLiteral(by.node)
  if (shifted?.step === 1 && shifted.literal === node) {
    return {
      reason: 'comparison-operator emits the same shifted literal',
      rule: 'shifted-literal',
      by,
    }
  }
  if (!context.runs(by, { mutator, node })) {
    return null
  }
  return {
    reason:
      'a comparison-operator mutant changes the comparison on part of the inputs where this change does',
    rule: 'O4',
    by,
  }
}

/**
 * Finds the expression of which a literal, through wrappers and the `!` chain
 * above it, is an operand.
 *
 * @param node - Literal that is an operand of a comparison, `&&` or `||`.
 * @param context - Mutator context of the file.
 * @returns The comparison, `&&` or `||` expression.
 */
function getOperandParent(node: Node, context: RunContext): Node {
  return context.syntax.getContextSlot(getNegationTop(node, context).node)
    .parent!
}
