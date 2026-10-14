import type { Node } from 'oxc-parser'

import type { LiteralValue } from './get-literal-value'
import type { RunContext } from './create-run-context'

import { isNoOpCallbackLiteral } from './is-no-op-callback-literal'
import { isBooleanModeOperand } from './is-boolean-mode-operand'
import { isBranchCopySkipped } from './is-branch-copy-skipped'
import { isComparisonOperand } from './is-comparison-operand'
import { isOrDefaultSkipped } from './is-or-default-skipped'
import { getLiteralMutator } from './get-literal-mutator'
import { getRunningValue } from './get-running-value'
import { getLiteralValue } from './get-literal-value'

/**
 * Finds the truth value that the literal mutator of a literal gives it, when it
 * emits a mutant that changes the literal's truth value (catalog 2.8): a
 * boolean flip, `0` to `1` and `-1` to `0` (also for BigInts), and a string or
 * a template without expressions emptied or filled. The skips of the literal
 * mutators that can apply to a literal in a decision apply here too: operands
 * of comparisons and of boolean-mode `&&` and `||`, error messages for strings,
 * timeout-only flips of boolean and number literals, branches made equal to the
 * other branch, no-op callbacks and emptied `||` defaults.
 *
 * @param node - Literal that a literal mutator would replace.
 * @param context - Mutator context with the test of mutants that will run.
 * @returns The new truth value, or null when no such mutant is emitted.
 */
export function getLiteralFlip(
  node: Node,
  context: RunContext,
): boolean | null {
  let mutator = getLiteralMutator(node)
  let value = getLiteralValue(node)
  let { parent } = context.sourceCode.getSlot(node)
  if (
    value === null ||
    (parent?.type === 'UnaryExpression' &&
      parent.operator === '-' &&
      parent.argument === node)
  ) {
    return null
  }
  let next = getNextValue(value)
  let truth = Boolean(next)
  if (
    truth === Boolean(value) ||
    isComparisonOperand(node, context) ||
    isBooleanModeOperand(node, context) ||
    (mutator === 'string-literal' && context.syntax.isErrorMessage(node)) ||
    (mutator !== 'string-literal' &&
      !context.settings.timeouts &&
      getRunningValue(node, context)?.value === truth) ||
    isBranchCopySkipped(node, { value: next }, context) ||
    isNoOpCallbackLiteral(node, next, context) ||
    isOrDefaultSkipped(node, next, context)
  ) {
    return null
  }
  return truth
}

/**
 * Computes the value a literal mutator gives a literal: a flipped boolean, a
 * number plus one, an empty or a filled string.
 *
 * @param value - Literal value.
 * @returns The new value.
 */
function getNextValue(value: LiteralValue): LiteralValue {
  switch (typeof value) {
    case 'boolean':
      return !value
    case 'string':
      return value === '' ? 'mootant' : ''
    case 'bigint':
      return value + 1n
    default:
      return value + 1
  }
}
