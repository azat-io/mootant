import type { Node } from 'oxc-parser'

import type { MutantSite, RunContext } from './create-run-context'

import { getNullishDirections } from './get-nullish-directions'
import { unwrapExpression } from '../../tree/unwrap-expression'
import { getComparisonPlan } from './get-comparison-plan'
import { getLogicalDrops } from './get-logical-drops'
import { isBooleanMode } from './is-boolean-mode'
import { isComparison } from './is-comparison'
import { getInnermost } from './get-innermost'
import { isAndOr } from './is-and-or'

/**
 * Candidate that forces a decision to a truth value.
 */
export interface DirectionQuery {
  /**
   * Mutant whose skip is decided.
   */
  candidate: MutantSite

  /**
   * Sub-formula the candidate forces.
   */
  decision: Node

  /**
   * Truth value the candidate forces the sub-formula to.
   */
  value: boolean
}

/**
 * State of the polarity walk below the decision.
 */
interface PolarSearch {
  /**
   * Node whose own drops do not count: the decision itself, unless the walk
   * includes it.
   */
  excluded: Node | null

  /**
   * The asking candidate and its forced value.
   */
  query: DirectionQuery

  /**
   * Mutator context with the test of mutants that will run.
   */
  context: RunContext
}

/**
 * Runs the polarity rule of logical-operator (catalog 4.8, R2): walks the
 * forced sub-formula through wrappers, `!` (each flips the sought value) and
 * `&&` and `||` nodes, looking for a mutant that will run and moves the
 * sub-formula only toward the forced value: a drop of a boolean-mode `&&` or
 * `||` strictly inside it, an entry of a comparison's plan, or a directional
 * mutant of a `??`. Such a mutant subsumes the candidate.
 *
 * @param query - Candidate, forced sub-formula and forced value.
 * @param context - Mutator context with the test of mutants that will run.
 * @param includesDecision - Whether the drops of the sub-formula itself count,
 *   as for the value-mode drop of a right operand, which reads the left one.
 * @returns Whether a directional mutant subsumes the candidate.
 */
export function hasPolarMutant(
  query: DirectionQuery,
  context: RunContext,
  includesDecision = false,
): boolean {
  return walkPolar(query.decision, false, {
    excluded: includesDecision ? null : unwrapExpression(query.decision),
    context,
    query,
  })
}

/**
 * Looks for a directional mutant at a node of the sub-formula and below it.
 *
 * @param node - Node of the sub-formula.
 * @param negatedAbove - Whether an odd number of `!` lies above the node.
 * @param search - Asking candidate, context and excluded node.
 * @returns Whether a mutant below moves the sub-formula toward the forced
 *   value.
 */
function walkPolar(
  node: Node,
  negatedAbove: boolean,
  search: PolarSearch,
): boolean {
  let { excluded, context, query } = search
  let { candidate, value } = query
  let { node: inner, negations } = getInnermost(node)
  let negated = negatedAbove !== (negations % 2 === 1)
  if (isComparison(inner)) {
    return (
      context.runs(
        { mutator: 'comparison-operator', node: inner },
        candidate,
      ) &&
      getComparisonPlan(inner, context).entries.some(
        entry => (entry.value !== negated) === value,
      )
    )
  }
  if (inner.type === 'LogicalExpression' && inner.operator === '??') {
    return getNullishDirections(inner, candidate, context).some(
      direction => (direction.value !== negated) === value,
    )
  }
  if (!isAndOr(inner)) {
    return false
  }
  if (
    inner !== excluded &&
    ((inner.operator === '&&') !== negated) === value &&
    isBooleanMode(inner, context) &&
    context.runs({ mutator: 'logical-operator', node: inner }, candidate)
  ) {
    let drops = getLogicalDrops(inner, context, 'distinguishing')
    if (drops.dropLeft || drops.dropRight) {
      return true
    }
  }
  return (
    walkPolar(inner.left, negated, search) ||
    walkPolar(inner.right, negated, search)
  )
}
