import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { isNullishConstant } from './is-nullish-constant'
import { getLiteralValue } from './get-literal-value'

/**
 * Tells whether an expression is a falsy constant (catalog 4.8, `??` in truth
 * positions): `false`, `0`, `0n`, `''`, an empty template, `null`, `undefined`,
 * `void x` or `NaN`, where `undefined` and `NaN` resolve to no declaration of
 * the file.
 *
 * @param node - Expression, through parentheses.
 * @param context - Mutator context of the file.
 * @returns Whether the expression is always falsy by its syntax.
 */
export function isFalsyConstant(node: Node, context: MutatorContext): boolean {
  let value = getLiteralValue(node)
  if (value !== null) {
    return !value
  }
  let inner = unwrapParentheses(node)
  return (
    isNullishConstant(inner, context) ||
    (inner.type === 'Identifier' &&
      inner.name === 'NaN' &&
      context.sourceCode.getBinding(inner) === null)
  )
}
