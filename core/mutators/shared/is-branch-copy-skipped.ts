import type { Node } from 'oxc-parser'

import type { LiteralValue } from './get-literal-value'
import type { RunContext } from './create-run-context'

import { ownerEmitsConstant } from './owner-emits-constant'
import { isExpectedBoolean } from './is-expected-boolean'
import { getLiteralMutator } from './get-literal-mutator'
import { isBooleanResult } from './is-boolean-result'
import { isBooleanValued } from './is-boolean-valued'
import { getLiteralValue } from './get-literal-value'
import { isMovedToward } from './is-moved-toward'
import { getBranchPair } from './get-branch-pair'

/**
 * New value of a literal, compared by value with the other branch.
 */
interface ValueReplacement {
  /**
   * Literal value the mutant gives the node.
   */
  value: LiteralValue
}

/**
 * New text of a template with expressions, compared by text with the other
 * branch.
 */
interface TextReplacement {
  /**
   * Replacement text of the mutant.
   */
  text: string
}

/**
 * Tells whether a literal mutant of a branch is skipped because it forces the
 * test of its branch pair (catalog 4.5, 4.11, 4.16; 5.2 O19 and 5.3 R5). A
 * mutant that gives the branch the value (or, for a template with expressions,
 * the text) of the other branch makes both branches alike, which is the test
 * forced to a constant: skipped statically when the test's owner emits that
 * constant, otherwise while a mutant that will run moves the test toward it. A
 * flipped boolean branch next to a boolean-valued branch (or any branch of a
 * pair in a boolean context or a boolean result) is subsumed the same way by a
 * mutant that moves the test toward the other branch. In the statement forms
 * the boolean result is judged on the other branch, whose kind the literal
 * itself cannot decide.
 *
 * @param node - Literal that a literal mutator would replace.
 * @param replacement - New value of the literal, or new text of a template with
 *   expressions.
 * @param context - Mutator context with the test of mutants that will run.
 * @returns Whether the literal mutant is skipped.
 */
export function isBranchCopySkipped(
  node: Node,
  replacement: ValueReplacement | TextReplacement,
  context: RunContext,
): boolean {
  let pair = getBranchPair(node, context)
  if (!pair) {
    return false
  }
  let { forced, other, test } = pair
  let query = {
    candidate: { mutator: getLiteralMutator(node)!, node },
    decision: test,
    value: forced,
  }
  let otherValue = getLiteralValue(other)
  let copies =
    'value' in replacement ?
      otherValue === replacement.value
    : context.sourceCode.getText(other) === replacement.text
  if (copies) {
    return (
      ownerEmitsConstant(test, forced, context) || isMovedToward(query, context)
    )
  }
  if (otherValue !== null || typeof getLiteralValue(node) !== 'boolean') {
    return false
  }
  let { parent } = context.syntax.getContextSlot(node)
  let booleanOther =
    isBooleanValued(other, context) ||
    (parent?.type === 'ConditionalExpression' ?
      context.syntax.isBooleanContext(parent) ||
      isExpectedBoolean(parent, context) ||
      isBooleanResult(parent, context)
    : isBooleanResult(other, context))
  return booleanOther && isMovedToward(query, context)
}
