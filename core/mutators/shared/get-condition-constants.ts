import type { Node } from 'oxc-parser'

import type { RunContext } from './create-run-context'

import { isNoOpCallbackConstant } from './is-no-op-callback-constant'
import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { getNullishDirections } from './get-nullish-directions'
import { getLeaveNowValue } from './get-leave-now-value'
import { isAlwaysNullish } from './is-always-nullish'
import { getRunningValue } from './get-running-value'
import { getLiteralValue } from './get-literal-value'
import { isAlwaysTruthy } from './is-always-truthy'
import { getInnermost } from './get-innermost'
import { isComparison } from './is-comparison'
import { isNegation } from './is-negation'
import { isAndOr } from './is-and-or'

/**
 * Plans the constants condition emits on a node (catalog 4.7): the node must be
 * condition's replaced node, a test without parentheses or a value negation
 * (the top of a `!` chain that is not a test and not an operand of `&&` or
 * `||`), and its innermost node must not be a comparison, a `&&` or `||` or a
 * literal, which other mutators own. `true` and `false` are then emitted except
 * the constant the types already give, the loop's running value, a constant
 * that a running directional mutant of a `??` test subsumes, the leave-now
 * constant of a first exit test, and a constant that makes a no-op callback.
 * The plan is pure: the redundancy and ownership rules read it without running
 * condition.
 *
 * @param node - Node of the runtime tree.
 * @param context - Mutator context with the test of mutants that will run.
 * @returns The constants condition emits on the node, `true` first; none when
 *   the node is not condition's replaced node.
 */
export function getConditionConstants(
  node: Node,
  context: RunContext,
): boolean[] {
  let { parent } = context.syntax.getContextSlot(node)
  let isTarget =
    context.syntax.isConditionTest(node) || context.syntax.isLoopTest(node) ?
      unwrapParentheses((parent as { test: Node }).test) === node
    : isNegation(node) && !isNegation(parent) && !isAndOr(parent)
  let { node: inner, negations } = getInnermost(node)
  if (
    !isTarget ||
    isComparison(inner) ||
    isAndOr(inner) ||
    inner.type === 'Literal' ||
    getLiteralValue(inner) !== null
  ) {
    return []
  }
  let negated = negations % 2 === 1
  let type = context.hints.getType(inner)
  let fixed: boolean | null = null
  if (isAlwaysTruthy(type)) {
    fixed = !negated
  } else if (isAlwaysNullish(type)) {
    fixed = negated
  }
  let running =
    context.settings.timeouts ? null : getRunningValue(node, context)
  let subsumed =
    inner.type === 'LogicalExpression' ?
      getNullishDirections(inner, { mutator: 'condition', node }, context).map(
        direction => direction !== negated,
      )
    : []
  let leaveNow = getLeaveNowValue(node, context)
  return [true, false].filter(
    value =>
      value !== fixed &&
      value !== running?.value &&
      value !== leaveNow &&
      !subsumed.includes(value) &&
      !isNoOpCallbackConstant(node, value, context),
  )
}
