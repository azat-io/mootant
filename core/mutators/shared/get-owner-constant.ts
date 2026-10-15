import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'
import type { MutantSite, RunContext } from './create-run-context'

import { createStaticRunContext } from './create-static-run-context'
import { getConditionConstants } from './get-condition-constants'
import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { unwrapExpression } from '../../tree/unwrap-expression'
import { getComparisonPlan } from './get-comparison-plan'
import { getLiteralMutator } from './get-literal-mutator'
import { getGroupConstant } from './get-group-constant'
import { getLiteralTruth } from './get-literal-truth'
import { getLiteralFlip } from './get-literal-flip'
import { isComparison } from './is-comparison'
import { getInnermost } from './get-innermost'
import { isAndOr } from './is-and-or'

/**
 * Finds the mutant with which the owner of a decision emits a constant on it
 * (catalog 5.2, O19): the owner chosen by O1, reached through wrappers, `!` and
 * conditionals whose branch on the forced side is a literal with the sought
 * truth value, emits the constant by its own rules, judged with every mutator
 * enabled and without ignore comments: condition's constant, a comparison's
 * constant, a group constant, or the flip of a literal. A candidate with the
 * behavior of that decision forced to the value is then the same mutant under
 * another name and is skipped statically.
 *
 * @param node - Decision: a test, a returned value or a node inside one.
 * @param value - Truth value the candidate forces the decision to.
 * @param context - Mutator context of the file.
 * @returns The owner's mutant that emits the constant, or null when the owner
 *   does not emit it.
 */
export function getOwnerConstant(
  node: Node,
  value: boolean,
  context: MutatorContext,
): MutantSite | null {
  return findConstant(node, value, createStaticRunContext(context))
}

/**
 * Finds the owner's mutant that emits the sought constant on a node of the
 * decision.
 *
 * @param node - Node of the decision.
 * @param wantedAbove - Truth value sought at the node.
 * @param context - Mutator context under which every mutant runs.
 * @returns The mutant, or null when the constant is not emitted.
 */
function findConstant(
  node: Node,
  wantedAbove: boolean,
  context: RunContext,
): MutantSite | null {
  let target = unwrapParentheses(node)
  let outer = unwrapExpression(node)
  let part = (target === outer ? [target] : [target, outer]).find(item =>
    getConditionConstants(item, context).values.includes(wantedAbove),
  )
  if (part) {
    return { mutator: 'condition', node: part }
  }
  let { node: inner, negations } = getInnermost(node)
  let wanted = wantedAbove !== (negations % 2 === 1)
  if (inner.type === 'ConditionalExpression') {
    return (
      (getLiteralTruth(inner.consequent, context) === wanted ?
        findConstant(inner.test, true, context)
      : null) ??
      (getLiteralTruth(inner.alternate, context) === wanted ?
        findConstant(inner.test, false, context)
      : null)
    )
  }
  if (isComparison(inner)) {
    return (
        getComparisonPlan(inner, context).entries.some(
          entry => entry.kind === 'constant' && entry.value === wanted,
        )
      ) ?
        { mutator: 'comparison-operator', node: inner }
      : null
  }
  if (isAndOr(inner)) {
    return (
        (inner.operator === '||') === wanted &&
          getGroupConstant(inner, context).emitted
      ) ?
        { mutator: 'logical-operator', node: inner }
      : null
  }
  return getLiteralFlip(inner, context) === wanted ?
      { mutator: getLiteralMutator(inner)!, node: inner }
    : null
}
