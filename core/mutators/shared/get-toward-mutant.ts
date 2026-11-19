import type { ConditionalExpression, LogicalExpression, Node } from 'oxc-parser'

import type { MutantSite, RunContext } from './create-run-context'
import type { DirectionQuery } from './has-polar-mutant'

import { getConditionConstants } from './get-condition-constants'
import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { getNullishDirections } from './get-nullish-directions'
import { unwrapExpression } from '../../tree/unwrap-expression'
import { isEffectFree } from '../../syntax/is-effect-free'
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
 * Asking candidate and context of a walk, and whether it keeps effects.
 */
interface TowardSearch {
  /**
   * Whether the mutant must evaluate every part of the decision that has an
   * effect as the decision does.
   */
  keepsEffects: boolean

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
 * candidate. A candidate that still evaluates the whole decision, such as the
 * removal of a then-branch, is subsumed only by a mutant that also evaluates
 * every part of the decision with an effect (see `isEffectFree`) as the
 * decision does: with `keepsEffects`, the walk passes over a constant that
 * replaces such a part, a mutant that skips it or runs it on more inputs, and a
 * mutant of an operand that decides whether it runs, and looks further.
 *
 * @param query - Candidate, decision and forced value.
 * @param context - Mutator context with the test of mutants that will run.
 * @param keepsEffects - Whether the mutant must evaluate every part of the
 *   decision with an effect as the decision does, for a candidate that keeps
 *   the whole decision.
 * @returns The first such mutant in walk order, or null when the candidate is
 *   not redundant.
 */
export function getTowardMutant(
  query: DirectionQuery,
  context: RunContext,
  keepsEffects = false,
): MutantSite | null {
  return walkToward(query.decision, query.value, {
    keepsEffects,
    context,
    query,
  })
}

/**
 * Looks for a mutant that moves a node of the decision toward a truth value.
 * Condition's constant and the constant of a comparison replace the node, so
 * they skip all of it; a swap or shifted literal of a comparison keeps both
 * operands. Every directional mutant of a `??` keeps its left side and skips
 * the default or runs it on more inputs, except the flip of a literal default.
 *
 * @param node - Node of the decision.
 * @param wantedAbove - Truth value sought at the node.
 * @param search - Asking candidate, context and whether effects are kept.
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
      mayChangeRun(item, search) &&
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
            entry =>
              entry.value === wanted &&
              (entry.kind !== 'constant' || mayChangeRun(inner, search)),
          )
      ) ?
        owner
      : null
  }
  if (inner.type === 'LogicalExpression' && inner.operator === '??') {
    return (
      getNullishDirections(inner, candidate, context).find(
        direction =>
          direction.value === wanted && mayChangeRun(inner.right, search),
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
 * The drop of the left operand skips it and runs the right one on more inputs,
 * the drop of the right operand skips it, the group constant skips both, and a
 * mutant of the left operand changes where the right one runs.
 *
 * @param node - `&&` or `||` of the decision.
 * @param wanted - Truth value sought at the expression.
 * @param search - Asking candidate, context and whether effects are kept.
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
      if (
        (drops.dropLeft && mayChangeRun(node, search)) ||
        (drops.dropRight && mayChangeRun(node.right, search))
      ) {
        return owner
      }
    }
    if (
      identity !== wanted &&
      mayChangeRun(node, search) &&
      getGroupConstant(node, context).emitted
    ) {
      return owner
    }
  }
  return (
    (mayChangeRun(node.right, search) ?
      walkToward(node.left, wanted, search)
    : null) ?? walkToward(node.right, wanted, search)
  )
}

/**
 * Looks for a mutant that moves a conditional toward a truth value: through its
 * test, toward the branch that is a literal of that value or away from the one
 * that is a literal of the other value, then through its branches. A mutant of
 * the test switches the branch that runs.
 *
 * @param node - Conditional of the decision.
 * @param wanted - Truth value sought at the conditional.
 * @param search - Asking candidate, context and whether effects are kept.
 * @returns The mutant, or null when none will run.
 */
function walkConditional(
  node: ConditionalExpression,
  wanted: boolean,
  search: TowardSearch,
): MutantSite | null {
  let consequent = getLiteralTruth(node.consequent, search.context)
  let alternate = getLiteralTruth(node.alternate, search.context)
  let switches =
    mayChangeRun(node.consequent, search) &&
    mayChangeRun(node.alternate, search)
  return (
    (switches && (consequent === wanted || alternate === !wanted) ?
      walkToward(node.test, true, search)
    : null) ??
    (switches && (alternate === wanted || consequent === !wanted) ?
      walkToward(node.test, false, search)
    : null) ??
    walkToward(node.consequent, wanted, search) ??
    walkToward(node.alternate, wanted, search)
  )
}

/**
 * Tells whether the walk accepts a mutant that skips a part of the decision on
 * some inputs or runs it where the decision does not: always, unless the walk
 * keeps effects and the part has one.
 *
 * @param part - Part of the decision that the mutant skips or newly runs.
 * @param search - Asking candidate, context and whether effects are kept.
 * @returns Whether the mutant may change where the part runs.
 */
function mayChangeRun(part: Node, search: TowardSearch): boolean {
  return !search.keepsEffects || isEffectFree(part)
}
