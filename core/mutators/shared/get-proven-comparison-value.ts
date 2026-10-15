import type { PrivateInExpression, BinaryExpression, Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { isNullishConstant } from './is-nullish-constant'
import { isNonNullable } from './is-non-nullable'
import { getTypeofName } from './get-typeof-name'

/**
 * Finds the value an equality comparison always has by the type hints (catalog
 * 4.6, rules 4 and 5): a comparison of a non-nullable value with `null`,
 * `undefined` or `void x` is never equal, and `typeof X` compared with a string
 * literal is decided when every value of `X` gives one `typeof` result.
 *
 * @param node - Comparison of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns The constant value of the comparison, or null when it is not proven.
 */
export function getProvenComparisonValue(
  node: PrivateInExpression | BinaryExpression,
  context: MutatorContext,
): boolean | null {
  let { operator, right, left } = node
  if (!['===', '!==', '==', '!='].includes(operator)) {
    return null
  }
  let negated = operator.startsWith('!')
  let match =
    getTypeofMatch(left, right, context) ?? getTypeofMatch(right, left, context)
  if (match !== null) {
    return match !== negated
  }
  let other = null
  if (isNullishConstant(right, context)) {
    other = left
  } else if (isNullishConstant(left, context)) {
    other = right
  }
  return other && isNonNullable(context.hints.getType(other)) ? negated : null
}

/**
 * Decides `typeof X === 'name'` when the type of `X` gives one `typeof` result.
 *
 * @param operand - Operand that may be the `typeof` expression.
 * @param other - The other operand, which may be the string literal.
 * @param context - Mutator context of the file.
 * @returns Whether the names match, or null when the pair does not decide.
 */
function getTypeofMatch(
  operand: Node,
  other: Node,
  context: MutatorContext,
): boolean | null {
  let typeofNode = unwrapParentheses(operand)
  let literal = unwrapParentheses(other)
  if (
    typeofNode.type !== 'UnaryExpression' ||
    typeofNode.operator !== 'typeof' ||
    literal.type !== 'Literal' ||
    typeof literal.value !== 'string'
  ) {
    return null
  }
  let name = getTypeofName(context.hints.getType(typeofNode.argument))
  return name === null ? null : name === literal.value
}
