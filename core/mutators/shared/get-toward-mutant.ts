import type { ConditionalExpression, LogicalExpression, Node } from 'oxc-parser'

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
    return walkConditional(inner, wanted, search)
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
    return walkAndOr(inner, wanted, search)
  }
  if (getLiteralFlip(inner, context) !== wanted) {
    return null
  }
  let literal = { mutator: getLiteralMutator(inner)!, node: inner }
  return context.runs(literal, candidate) ? literal : null
}

/**
 * Looks for a mutant that moves a `&&` or `||` toward a truth value:
 * logical-operator's drop of a boolean-mode group toward its identity, or its
 * group constant toward its absorbing value, then a mutant of either operand.
 *
 * @param node - `&&` or `||` of the decision.
 * @param wanted - Truth value sought at the expression.
 * @param search - Asking candidate and context.
 * @returns The mutant, or null when none will run.
 */
function walkAndOr(
  node: LogicalExpression,
  wanted: boolean,
  search: TowardSearch,
): MutantSite | null {
  let { context, query } = search
  let identity = node.operator === '&&'
  let owner = { mutator: 'logical-operator', node }
  if (context.runs(owner, query.candidate)) {
    if (identity === wanted && isBooleanMode(node, context)) {
      let drops = getLogicalDrops(node, context, 'distinguishing')
      if (drops.dropLeft || drops.dropRight) {
        return owner
      }
    }
    if (identity !== wanted && getGroupConstant(node, context).emitted) {
      return owner
    }
  }
  return (
    walkToward(node.left, wanted, search) ??
    walkToward(node.right, wanted, search)
  )
}

/**
 * Looks for a mutant that moves a conditional toward a truth value: through its
 * test, toward the branch that is a literal of that value or away from the one
 * that is a literal of the other value, then through its branches.
 *
 * @param node - Conditional of the decision.
 * @param wanted - Truth value sought at the conditional.
 * @param search - Asking candidate and context.
 * @returns The mutant, or null when none will run.
 */
function walkConditional(
  node: ConditionalExpression,
  wanted: boolean,
  search: TowardSearch,
): MutantSite | null {
  let consequent = getLiteralTruth(node.consequent, search.context)
  let alternate = getLiteralTruth(node.alternate, search.context)
  return (
    (consequent === wanted || alternate === !wanted ?
      walkToward(node.test, true, search)
    : null) ??
    (alternate === wanted || consequent === !wanted ?
      walkToward(node.test, false, search)
    : null) ??
    walkToward(node.consequent, wanted, search) ??
    walkToward(node.alternate, wanted, search)
  )
}
