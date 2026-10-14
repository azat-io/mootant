import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'

import { unwrapParentheses } from '../../tree/unwrap-parentheses'

/**
 * Tells whether an expression is always `null` or `undefined` by its syntax:
 * the literal `null`, the identifier `undefined` that resolves to no
 * declaration of the file, or `void x`.
 *
 * @param node - Expression, through parentheses.
 * @param context - Mutator context of the file.
 * @returns Whether the expression is a nullish constant.
 */
export function isNullishConstant(
  node: Node,
  context: MutatorContext,
): boolean {
  let inner = unwrapParentheses(node)
  switch (inner.type) {
    case 'UnaryExpression':
      return inner.operator === 'void'
    case 'Identifier':
      return (
        inner.name === 'undefined' &&
        context.sourceCode.getBinding(inner) === null
      )
    case 'Literal':
      return inner.raw === 'null'
    default:
      return false
  }
}
