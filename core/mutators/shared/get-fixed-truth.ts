import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'

import { getProvenComparisonValue } from './get-proven-comparison-value'
import { isAlwaysNullish } from './is-always-nullish'
import { getLiteralTruth } from './get-literal-truth'
import { isAlwaysTruthy } from './is-always-truthy'
import { isComparison } from './is-comparison'
import { getInnermost } from './get-innermost'
import { isAndOr } from './is-and-or'

/**
 * Finds the truth value an operand always has (catalog 4.8, fixed operands):
 * through wrappers and `!` (each inverts), a literal has its truth value, a
 * comparison that rule 4 or 5 of 4.6 proves constant has that value, an
 * always-truthy operand is true and an always-nullish one false, and a `&&` or
 * `||` is fixed to its absorbing value when one operand is, or to its identity
 * when both are.
 *
 * @param node - Operand of a logical expression.
 * @param context - Mutator context of the file.
 * @returns The fixed truth value, or null when the operand is not fixed.
 */
export function getFixedTruth(
  node: Node,
  context: MutatorContext,
): boolean | null {
  let { node: inner, negations } = getInnermost(node)
  let value = getOwnTruth(inner, context)
  return value === null ? null : value !== (negations % 2 === 1)
}

/**
 * Finds the fixed truth value of a node that is neither a wrapper nor a `!`.
 *
 * @param node - Innermost node of an operand.
 * @param context - Mutator context of the file.
 * @returns The fixed truth value, or null.
 */
function getOwnTruth(node: Node, context: MutatorContext): boolean | null {
  if (isAndOr(node)) {
    let identity = node.operator === '&&'
    let left = getFixedTruth(node.left, context)
    let right = getFixedTruth(node.right, context)
    if (left === !identity || right === !identity) {
      return !identity
    }
    return left === identity && right === identity ? identity : null
  }
  if (isComparison(node)) {
    return getProvenComparisonValue(node, context)
  }
  let literal = getLiteralTruth(node, context)
  if (literal !== null) {
    return literal
  }
  let type = context.hints.getType(node)
  if (isAlwaysTruthy(type)) {
    return true
  }
  if (isAlwaysNullish(type)) {
    return false
  }
  return null
}
