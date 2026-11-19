import type { Node } from 'oxc-parser'

import type { LiteralChange } from '../../../types/syntax/literal-change'
import type { SkipNote } from '../../../types/mutant/skip-note'
import type { RunContext } from './create-run-context'

import { getForcedTestJustifier } from './get-forced-test-justifier'
import { isEffectFree } from '../../syntax/is-effect-free'
import { isExpectedBoolean } from './is-expected-boolean'
import { getLiteralMutator } from './get-literal-mutator'
import { isBooleanResult } from './is-boolean-result'
import { isBooleanValued } from './is-boolean-valued'
import { getLiteralValue } from './get-literal-value'
import { getBranchPair } from './get-branch-pair'
import { isReadOnly } from './is-read-only'

/**
 * Decides whether a literal mutant of a branch is skipped because it forces the
 * test of its branch pair (catalog 4.5, 4.11, 4.16; 5.2 O19 and 5.3 R5). A
 * mutant that gives the branch the value (or, for a template with expressions,
 * the text) of the other branch makes both branches alike, which is the test
 * forced to a constant while the test still runs: skipped statically when the
 * test has no effect and its owner emits that constant, otherwise while a
 * mutant that will run moves the test toward it and keeps every effect of the
 * test (see `getForcedTestJustifier`). A flipped boolean branch next to a
 * boolean-valued branch (or any branch of a pair in a boolean context or a
 * boolean result) is subsumed the same way by a mutant that moves the test
 * toward the other branch, which then runs where the candidate gives the
 * flipped value, so that branch must have no effect; when its only effects are
 * calls of well-known read-only methods (see `isReadOnly`), the skip rests on
 * that guess. In the statement forms the boolean result is judged on the other
 * branch, whose kind the literal itself cannot decide. A skipped mutant comes
 * with its rule.
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
    let found = getForcedTestJustifier(query, context, true)
    return (
      found && {
        reason:
          found.owned ?
            `it copies the other branch, which is the test forced to ${forced}, as ${found.by.mutator} does`
          : `it copies the other branch, which is the test forced to ${forced}, as ${found.by.mutator} does on some inputs`,
        ...(found.heuristic && { heuristic: true }),
        rule: found.owned ? 'O19' : 'R5',
        by: found.by,
      }
    )
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
  if (!booleanOther) {
    return null
  }
  let otherFree = isEffectFree(other)
  let found =
    otherFree || isReadOnly(other, context) ?
      getForcedTestJustifier(query, context, false)
    : null
  return (
    found && {
      reason: `next to a boolean-valued branch it acts like the test forced to ${forced}, as ${found.by.mutator} does on some inputs`,
      ...((found.heuristic || !otherFree) && { heuristic: true }),
      by: found.by,
      rule: 'R5',
    }
  )
}
