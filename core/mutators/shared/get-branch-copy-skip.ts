import type { Node } from 'oxc-parser'

import type { LiteralChange } from '../../../types/literal-change'
import type { SkipNote } from '../../../types/skip-note'
import type { RunContext } from './create-run-context'

import { isExpectedBoolean } from './is-expected-boolean'
import { getLiteralMutator } from './get-literal-mutator'
import { getOwnerConstant } from './get-owner-constant'
import { isBooleanResult } from './is-boolean-result'
import { isBooleanValued } from './is-boolean-valued'
import { getLiteralValue } from './get-literal-value'
import { getTowardMutant } from './get-toward-mutant'
import { getBranchPair } from './get-branch-pair'

/**
 * Decides whether a literal mutant of a branch is skipped because it forces the
 * test of its branch pair (catalog 4.5, 4.11, 4.16; 5.2 O19 and 5.3 R5). A
 * mutant that gives the branch the value (or, for a template with expressions,
 * the text) of the other branch makes both branches alike, which is the test
 * forced to a constant: skipped statically when the test's owner emits that
 * constant, otherwise while a mutant that will run moves the test toward it. A
 * flipped boolean branch next to a boolean-valued branch (or any branch of a
 * pair in a boolean context or a boolean result) is subsumed the same way by a
 * mutant that moves the test toward the other branch. In the statement forms
 * the boolean result is judged on the other branch, whose kind the literal
 * itself cannot decide. A skipped mutant comes with its rule.
 *
 * @param node - Literal that a literal mutator would replace.
 * @param replacement - New value of the literal, or new text of a template with
 *   expressions.
 * @param context - Mutator context with the test of mutants that will run.
 * @returns Rule and reason of the skip, or null when the mutant is emitted.
 */
export function getBranchCopySkip(
  node: Node,
  replacement: LiteralChange,
  context: RunContext,
): SkipNote | null {
  let pair = getBranchPair(node, context)
  if (!pair) {
    return null
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
    let owner = getOwnerConstant(test, forced, context)
    if (owner) {
      return {
        reason: `it copies the other branch, which is the test forced to ${forced}, a constant the test's owner emits`,
        rule: 'O19',
        by: owner,
      }
    }
    let toward = getTowardMutant(query, context)
    return toward ?
        {
          reason: `it copies the other branch, which is the test forced to ${forced}, and a running mutant moves the test toward ${forced}`,
          by: toward,
          rule: 'R5',
        }
      : null
  }
  if (otherValue !== null || typeof getLiteralValue(node) !== 'boolean') {
    return null
  }
  let { parent } = context.syntax.getContextSlot(node)
  let booleanOther =
    isBooleanValued(other, context) ||
    (parent?.type === 'ConditionalExpression' ?
      context.syntax.isBooleanContext(parent) ||
      isExpectedBoolean(parent, context) ||
      isBooleanResult(parent, context)
    : isBooleanResult(other, context))
  let toward = booleanOther ? getTowardMutant(query, context) : null
  return toward ?
      {
        reason: `next to a boolean-valued branch it acts like the test forced to ${forced}, and a running mutant moves the test toward ${forced}`,
        by: toward,
        rule: 'R5',
      }
    : null
}
