import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

import { unwrapExpression } from '../../tree/unwrap-expression'
import { isComparison } from './is-comparison'
import { getTypeView } from './get-type-view'
import { isNegation } from './is-negation'
import { isAndOr } from './is-and-or'

/**
 * Tells whether an expression always gives `true` or `false` (catalog 2.2,
 * `BV`): through wrappers, a comparison, a `!` expression, a boolean literal, a
 * call of the global `Boolean`, a `&&` or `||` of two such operands, or a value
 * whose type is a boolean that cannot be nullish.
 *
 * @param node - Expression of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns Whether the expression is boolean-valued.
 */
export function isBooleanValued(node: Node, context: MutatorContext): boolean {
  let inner = unwrapExpression(node)
  if (isComparison(inner) || isNegation(inner)) {
    return true
  }
  if (isAndOr(inner)) {
    return (
      isBooleanValued(inner.left, context) &&
      isBooleanValued(inner.right, context)
    )
  }
  if (
    (inner.type === 'Literal' && typeof inner.value === 'boolean') ||
    isGlobalBooleanCall(inner, context)
  ) {
    return true
  }
  let { nullability, type } = getTypeView(context.hints.getType(inner))
  return type === 'boolean' && nullability === 'non-nullable'
}

/**
 * Tells whether an expression is a call, optional or not, of the global
 * `Boolean` function.
 *
 * @param node - Expression without outer wrappers.
 * @param context - Mutator context of the file.
 * @returns Whether the callee is, through wrappers, the identifier `Boolean`
 *   that resolves to no declaration of the file.
 */
function isGlobalBooleanCall(node: Node, context: MutatorContext): boolean {
  let call = node.type === 'ChainExpression' ? node.expression : node
  if (call.type !== 'CallExpression') {
    return false
  }
  let callee = unwrapExpression(call.callee)
  return (
    callee.type === 'Identifier' &&
    callee.name === 'Boolean' &&
    context.sourceCode.getBinding(callee) === null
  )
}
