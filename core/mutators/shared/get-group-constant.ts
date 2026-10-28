import type { LogicalExpression } from 'oxc-parser'

import type { SkipNote } from '../../../types/mutant/skip-note'
import type { RunContext } from './create-run-context'

import { isConstantEligibleGroup } from './is-constant-eligible-group'
import { isNoOpCallbackConstant } from './is-no-op-callback-constant'
import { getLoopRunningSkip } from './get-loop-running-skip'
import { NO_OP_CALLBACK_SKIP } from './no-op-callback-skip'
import { getLeaveNowValue } from './get-leave-now-value'
import { isBooleanValued } from './is-boolean-valued'
import { getRunningValue } from './get-running-value'
import { hasPolarMutant } from './has-polar-mutant'
import { getNegationTop } from './get-negation-top'
import { LEAVE_NOW_SKIP } from './leave-now-skip'
import { getFixedTruth } from './get-fixed-truth'
import { isBooleanMode } from './is-boolean-mode'
import { isAndOr } from './is-and-or'

/**
 * Whether logical-operator gives a group its absorbing constant.
 */
export interface GroupConstant {
  /**
   * Why the constant is not emitted on a node that could have it, or null.
   */
  skip: SkipNote | null

  /**
   * Whether the constant is emitted.
   */
  emitted: boolean
}

/**
 * Decides whether logical-operator gives a `&&` or `||` its absorbing constant
 * (`false` for `&&`, `true` for `||`; catalog 4.8, emission 3): only on a group
 * root that is not an operand, through `!`, of another `&&` or `||`, unless a
 * running mutant inside the group moves it only toward that constant. In
 * boolean mode the constant is also skipped when fixed operands already give
 * it, when it is the loop's running value or a first exit test's leave-now
 * constant; in value mode the group must be constant-eligible. In both modes
 * the constant is skipped when it makes a no-op callback. A skipped constant
 * comes with its rule.
 *
 * @param node - `&&` or `||` expression of the runtime tree.
 * @param context - Mutator context with the test of mutants that will run.
 * @returns Whether the constant is emitted, and why not when it is skipped.
 */
export function getGroupConstant(
  node: LogicalExpression,
  context: RunContext,
): GroupConstant {
  let { parent } = context.syntax.getContextSlot(
    getNegationTop(node, context).node,
  )
  if (isAndOr(parent)) {
    return { emitted: false, skip: null }
  }
  let absorbing = node.operator === '||'
  let polar = {
    candidate: { mutator: 'logical-operator', node },
    value: absorbing,
    decision: node,
  }
  let skip: SkipNote | null = null
  if (!isBooleanMode(node, context)) {
    if (!isConstantEligibleGroup(node, context)) {
      return { emitted: false, skip: null }
    }
  } else if (
    (context.syntax.isBooleanContext(node) || isBooleanValued(node, context)) &&
    getFixedTruth(node, context) === absorbing
  ) {
    skip = {
      reason: `the group is always ${absorbing ? 'truthy' : 'falsy'}`,
      rule: 'fixed-operand',
    }
  } else if (
    !context.settings.timeouts &&
    getRunningValue(node, context)?.value === absorbing
  ) {
    skip = getLoopRunningSkip(absorbing)
  } else if (getLeaveNowValue(node, context) === absorbing) {
    skip = LEAVE_NOW_SKIP
  }
  if (skip === null && isNoOpCallbackConstant(node, absorbing, context)) {
    skip = NO_OP_CALLBACK_SKIP
  }
  if (skip === null && hasPolarMutant(polar, context)) {
    skip = {
      reason:
        'a running mutant inside the group moves it only toward its absorbing value',
      rule: 'R2',
    }
  }
  return { emitted: skip === null, skip }
}
