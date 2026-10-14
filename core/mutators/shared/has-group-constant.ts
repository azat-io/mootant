import type { LogicalExpression } from 'oxc-parser'

import type { RunContext } from './create-run-context'

import { isConstantEligibleGroup } from './is-constant-eligible-group'
import { isNoOpCallbackConstant } from './is-no-op-callback-constant'
import { getLeaveNowValue } from './get-leave-now-value'
import { isBooleanValued } from './is-boolean-valued'
import { getRunningValue } from './get-running-value'
import { hasPolarMutant } from './has-polar-mutant'
import { getNegationTop } from './get-negation-top'
import { getFixedTruth } from './get-fixed-truth'
import { isBooleanMode } from './is-boolean-mode'
import { isAndOr } from './is-and-or'

/**
 * Decides whether logical-operator gives a `&&` or `||` its absorbing constant
 * (`false` for `&&`, `true` for `||`; catalog 4.8, emission 3): only on a group
 * root that is not an operand, through `!`, of another `&&` or `||`, unless a
 * running mutant inside the group moves it only toward that constant. In
 * boolean mode the constant is also skipped when fixed operands already give
 * it, when it is the loop's running value or a first exit test's leave-now
 * constant; in value mode the group must be constant-eligible. In both modes
 * the constant is skipped when it makes a no-op callback.
 *
 * @param node - `&&` or `||` expression of the runtime tree.
 * @param context - Mutator context with the test of mutants that will run.
 * @returns Whether the constant is emitted.
 */
export function hasGroupConstant(
  node: LogicalExpression,
  context: RunContext,
): boolean {
  let { parent } = context.syntax.getContextSlot(
    getNegationTop(node, context).node,
  )
  if (isAndOr(parent)) {
    return false
  }
  let absorbing = node.operator === '||'
  let polar = {
    candidate: { mutator: 'logical-operator', node },
    value: absorbing,
    decision: node,
  }
  if (!isBooleanMode(node, context)) {
    return (
      isConstantEligibleGroup(node, context) &&
      !isNoOpCallbackConstant(node, absorbing, context) &&
      !hasPolarMutant(polar, context)
    )
  }
  let fixed =
    context.syntax.isBooleanContext(node) || isBooleanValued(node, context) ?
      getFixedTruth(node, context)
    : null
  let running =
    context.settings.timeouts ? null : getRunningValue(node, context)
  return (
    fixed !== absorbing &&
    running?.value !== absorbing &&
    getLeaveNowValue(node, context) !== absorbing &&
    !isNoOpCallbackConstant(node, absorbing, context) &&
    !hasPolarMutant(polar, context)
  )
}
