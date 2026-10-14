import type { Node } from 'oxc-parser'

import type { MutantSite, RunContext } from './create-run-context'
import type { DirectionQuery } from './has-polar-mutant'

import { getConditionConstants } from './get-condition-constants'
import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { getNullishDirections } from './get-nullish-directions'
import { unwrapExpression } from '../../tree/unwrap-expression'
import { getComparisonPlan } from './get-comparison-plan'
import { getLiteralMutator } from './get-literal-mutator'
import { getGroupConstant } from './get-group-constant'
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
 * Finds a mutant that will run and moves a decision only toward a truth value
 * (catalog 2.8, `toward`): it walks the decision through wrappers, `!` (each
 * flips the sought value), `&&` and `||` operands and conditionals, and looks
 * for condition's constant, a comparison entry, a drop of a boolean-mode `&&`
 * or `||` or its group constant, a directional mutant of a `??`, and a literal
 * flip, each giving the sought value. Such a mutant changes the decision only
 * where forcing it changes it, and to the same value, so it subsumes the
 * candidate.
 *
 * @param query - Candidate, decision and forced value.
 * @param context - Mutator context with the test of mutants that will run.
 * @returns The first such mutant in walk order, or null when the candidate is
 *   not redundant.
 */
export function getTowardMutant(
  query: DirectionQuery,
  context: RunContext,
): MutantSite | null {
  return walkToward(query.decision, query.value, { context, query })
}

/**
 * Looks for a mutant that moves a node of the decision toward a truth value.
 *
 * @param node - Node of the decision.
 * @param wantedAbove - Truth value sought at the node.
 * @param search - Asking candidate and context.
 * @returns The mutant, or null when none will run.
 */
function walkToward(
  node: Node,
  wantedAbove: boolean,
  search: TowardSearch,
): MutantSite | null {
  let { context, query } = search
  let { candidate } = query
  let target = unwrapParentheses(node)
  let outer = unwrapExpression(node)
  let part = (target === outer ? [target] : [target, outer]).find(
    item =>
      getConditionConstants(item, context).values.includes(wantedAbove) &&
      context.runs({ mutator: 'condition', node: item }, candidate),
  )
  if (part) {
    return { mutator: 'condition', node: part }
  }
  let { node: inner, negations } = getInnermost(node)
  let wanted = wantedAbove !== (negations % 2 === 1)
  if (inner.type === 'ConditionalExpression') {
    let consequent = getLiteralTruth(inner.consequent, context)
    let alternate = getLiteralTruth(inner.alternate, context)
    return (
      (consequent === wanted || alternate === !wanted ?
        walkToward(inner.test, true, search)
      : null) ??
      (alternate === wanted || consequent === !wanted ?
        walkToward(inner.test, false, search)
      : null) ??
      walkToward(inner.consequent, wanted, search) ??
      walkToward(inner.alternate, wanted, search)
    )
  }
  if (isComparison(inner)) {
    let owner = { mutator: 'comparison-operator', node: inner }
    return (
        context.runs(owner, candidate) &&
          getComparisonPlan(inner, context).entries.some(
            entry => entry.value === wanted,
          )
      ) ?
        owner
      : null
  }
  if (inner.type === 'LogicalExpression' && inner.operator === '??') {
    return (
      getNullishDirections(inner, candidate, context).find(
        direction => direction.value === wanted,
      )?.by ?? null
    )
  }
  if (isAndOr(inner)) {
    let identity = inner.operator === '&&'
    let owner = { mutator: 'logical-operator', node: inner }
    if (context.runs(owner, candidate)) {
      if (identity === wanted && isBooleanMode(inner, context)) {
        let drops = getLogicalDrops(inner, context, 'distinguishing')
        if (drops.dropLeft || drops.dropRight) {
          return owner
        }
      }
      if (identity !== wanted && getGroupConstant(inner, context).emitted) {
        return owner
      }
    }
    return (
      walkToward(inner.left, wanted, search) ??
      walkToward(inner.right, wanted, search)
    )
  }
  if (getLiteralFlip(inner, context) !== wanted) {
    return null
  }
  let literal = { mutator: getLiteralMutator(inner)!, node: inner }
  return context.runs(literal, candidate) ? literal : null
}
