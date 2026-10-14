import type { Node } from 'oxc-parser'

import type { DirectionQuery } from './has-polar-mutant'
import type { RunContext } from './create-run-context'

import { getConditionConstants } from './get-condition-constants'
import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { getNullishDirections } from './get-nullish-directions'
import { unwrapExpression } from '../../tree/unwrap-expression'
import { getComparisonPlan } from './get-comparison-plan'
import { getLiteralMutator } from './get-literal-mutator'
import { hasGroupConstant } from './has-group-constant'
import { getLogicalDrops } from './get-logical-drops'
import { getLiteralTruth } from './get-literal-truth'
import { getLiteralFlip } from './get-literal-flip'
import { isBooleanMode } from './is-boolean-mode'
import { isComparison } from './is-comparison'
import { getInnermost } from './get-innermost'
import { isAndOr } from './is-and-or'

/**
 * Asking candidate and context of a walk.
 */
interface TowardSearch {
  /**
   * Candidate, decision and forced value.
   */
  query: DirectionQuery

  /**
   * Mutator context with the test of mutants that will run.
   */
  context: RunContext
}

/**
 * Tells whether a mutant that will run moves a decision only toward a truth
 * value (catalog 2.8, `toward`): it walks the decision through wrappers, `!`
 * (each flips the sought value), `&&` and `||` operands and conditionals, and
 * looks for condition's constant, a comparison entry, a drop of a boolean-mode
 * `&&` or `||` or its group constant, a directional mutant of a `??`, and a
 * literal flip, each giving the sought value. Such a mutant changes the
 * decision only where forcing it changes it, and to the same value, so it
 * subsumes the candidate.
 *
 * @param query - Candidate, decision and forced value.
 * @param context - Mutator context with the test of mutants that will run.
 * @returns Whether the candidate is redundant.
 */
export function isMovedToward(
  query: DirectionQuery,
  context: RunContext,
): boolean {
  return walkToward(query.decision, query.value, { context, query })
}

/**
 * Looks for a mutant that moves a node of the decision toward a truth value.
 *
 * @param node - Node of the decision.
 * @param wantedAbove - Truth value sought at the node.
 * @param search - Asking candidate and context.
 * @returns Whether such a mutant will run.
 */
function walkToward(
  node: Node,
  wantedAbove: boolean,
  search: TowardSearch,
): boolean {
  let { context, query } = search
  let { candidate } = query
  let target = unwrapParentheses(node)
  let outer = unwrapExpression(node)
  if (
    (target === outer ? [target] : [target, outer]).some(
      part =>
        getConditionConstants(part, context).includes(wantedAbove) &&
        context.runs({ mutator: 'condition', node: part }, candidate),
    )
  ) {
    return true
  }
  let { node: inner, negations } = getInnermost(node)
  let wanted = wantedAbove !== (negations % 2 === 1)
  if (inner.type === 'ConditionalExpression') {
    let consequent = getLiteralTruth(inner.consequent, context)
    let alternate = getLiteralTruth(inner.alternate, context)
    return (
      ((consequent === wanted || alternate === !wanted) &&
        walkToward(inner.test, true, search)) ||
      ((alternate === wanted || consequent === !wanted) &&
        walkToward(inner.test, false, search)) ||
      walkToward(inner.consequent, wanted, search) ||
      walkToward(inner.alternate, wanted, search)
    )
  }
  if (isComparison(inner)) {
    return (
      context.runs(
        { mutator: 'comparison-operator', node: inner },
        candidate,
      ) &&
      getComparisonPlan(inner, context).some(entry => entry.value === wanted)
    )
  }
  if (inner.type === 'LogicalExpression' && inner.operator === '??') {
    return getNullishDirections(inner, candidate, context).includes(wanted)
  }
  if (isAndOr(inner)) {
    let identity = inner.operator === '&&'
    if (context.runs({ mutator: 'logical-operator', node: inner }, candidate)) {
      if (identity === wanted && isBooleanMode(inner, context)) {
        let drops = getLogicalDrops(inner, context, 'distinguishing')
        if (drops.dropLeft || drops.dropRight) {
          return true
        }
      }
      if (identity !== wanted && hasGroupConstant(inner, context)) {
        return true
      }
    }
    return (
      walkToward(inner.left, wanted, search) ||
      walkToward(inner.right, wanted, search)
    )
  }
  return (
    getLiteralFlip(inner, context) === wanted &&
    context.runs({ mutator: getLiteralMutator(inner)!, node: inner }, candidate)
  )
}
