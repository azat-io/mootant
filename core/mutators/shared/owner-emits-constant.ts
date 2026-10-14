import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'
import type { RunContext } from './create-run-context'

import { createStaticRunContext } from './create-static-run-context'
import { getConditionConstants } from './get-condition-constants'
import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { unwrapExpression } from '../../tree/unwrap-expression'
import { getComparisonPlan } from './get-comparison-plan'
import { hasGroupConstant } from './has-group-constant'
import { getLiteralTruth } from './get-literal-truth'
import { getLiteralFlip } from './get-literal-flip'
import { isComparison } from './is-comparison'
import { getInnermost } from './get-innermost'
import { isAndOr } from './is-and-or'

/**
 * Tells whether the owner of a decision emits a constant on it (catalog 5.2,
 * O19): the owner chosen by O1, reached through wrappers, `!` and conditionals
 * whose branch on the forced side is a literal with the sought truth value,
 * emits the constant by its own rules, judged with every mutator enabled and
 * without ignore comments: condition's constant, a comparison's constant, a
 * group constant, or the flip of a literal. A candidate with the behavior of
 * that decision forced to the value is then the same mutant under another name
 * and is skipped statically.
 *
 * @param node - Decision: a test, a returned value or a node inside one.
 * @param value - Truth value the candidate forces the decision to.
 * @param context - Mutator context of the file.
 * @returns Whether the owner emits the constant.
 */
export function ownerEmitsConstant(
  node: Node,
  value: boolean,
  context: MutatorContext,
): boolean {
  return emitsConstant(node, value, createStaticRunContext(context))
}

/**
 * Tells whether the owner of a node of the decision emits the sought constant.
 *
 * @param node - Node of the decision.
 * @param wantedAbove - Truth value sought at the node.
 * @param context - Mutator context under which every mutant runs.
 * @returns Whether the constant is emitted.
 */
function emitsConstant(
  node: Node,
  wantedAbove: boolean,
  context: RunContext,
): boolean {
  let target = unwrapParentheses(node)
  let outer = unwrapExpression(node)
  if (
    (target === outer ? [target] : [target, outer]).some(part =>
      getConditionConstants(part, context).includes(wantedAbove),
    )
  ) {
    return true
  }
  let { node: inner, negations } = getInnermost(node)
  let wanted = wantedAbove !== (negations % 2 === 1)
  if (inner.type === 'ConditionalExpression') {
    return (
      (getLiteralTruth(inner.consequent, context) === wanted &&
        emitsConstant(inner.test, true, context)) ||
      (getLiteralTruth(inner.alternate, context) === wanted &&
        emitsConstant(inner.test, false, context))
    )
  }
  if (isComparison(inner)) {
    return getComparisonPlan(inner, context).some(
      entry => entry.kind === 'constant' && entry.value === wanted,
    )
  }
  if (isAndOr(inner)) {
    return (
      (inner.operator === '||') === wanted && hasGroupConstant(inner, context)
    )
  }
  return getLiteralFlip(inner, context) === wanted
}
