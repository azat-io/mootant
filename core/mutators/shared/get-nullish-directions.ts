import type { LogicalExpression } from 'oxc-parser'

import type { MutantSite, RunContext } from './create-run-context'

import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { isBooleanModeOperand } from './is-boolean-mode-operand'
import { getLiteralMutator } from './get-literal-mutator'
import { getNullishPlan } from './get-nullish-plan'
import { getLiteralFlip } from './get-literal-flip'

/**
 * Truth value toward which a running directional mutant of a `??` moves it.
 */
export interface NullishDirection {
  /**
   * Directional mutant.
   */
  by: MutantSite

  /**
   * Truth value the mutant moves the `??` toward.
   */
  value: boolean
}

/**
 * Finds the truth values toward which the running directional mutants of a `??`
 * move it (catalog 4.7 and 4.8): logical-operator's drop of the default moves
 * it toward false, its swap to `||` toward true, and the flip of a literal
 * default by its literal mutator toward the default's other truth value. The
 * rules of logical-operator are read with `nullishSwap: 'distinguishing'`, the
 * setting under which a swap is emitted in every preset. Only a `??` in a truth
 * position (a boolean context or a boolean-mode operand) has directions: in a
 * value position its mutants change the value, not only the truth value.
 *
 * @param node - `??` expression of the runtime tree.
 * @param candidate - Mutant whose skip the directions decide.
 * @param context - Mutator context with the test of mutants that will run.
 * @returns The truth values with their mutants, in the order drop, swap, flip;
 *   none outside a truth position.
 */
export function getNullishDirections(
  node: LogicalExpression,
  candidate: MutantSite,
  context: RunContext,
): NullishDirection[] {
  if (
    !context.syntax.isBooleanContext(node) &&
    !isBooleanModeOperand(node, context)
  ) {
    return []
  }
  let directions: NullishDirection[] = []
  let plan = getNullishPlan(node, context, {
    nullishSwap: 'distinguishing',
    nullishNormalization: false,
  })
  let owner = { mutator: 'logical-operator', node }
  if (context.runs(owner, candidate)) {
    if (plan.dropRight) {
      directions.push({ value: false, by: owner })
    }
    if (plan.swap) {
      directions.push({ value: true, by: owner })
    }
  }
  let fallback = unwrapParentheses(node.right)
  let flip = getLiteralFlip(fallback, context)
  let literal = { mutator: getLiteralMutator(fallback)!, node: fallback }
  if (flip !== null && context.runs(literal, candidate)) {
    directions.push({ value: flip, by: literal })
  }
  return directions
}
