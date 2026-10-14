import type { UnaryExpression, Node } from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator-context'
import type { Mutator } from '../../types/mutator'

import { getLiteralValue } from './shared/get-literal-value'
import { getTypeView } from './shared/get-type-view'

/**
 * Removes a numeric unary operator (-x, +x, ~x) (catalog 4.17): the mutant is
 * the argument with its parentheses. `~~x` is one unit, also as `~(~x)`: the
 * outer `~` gives `x` and the inner one nothing. Any other operator removes
 * only itself: `-~x` gives `~x`. Skipped: `-` applied to a number literal
 * (number-literal owns it) and `+x` when `x` is a literal or hinted to be only
 * a number, never nullish or a BigInt (EQ): `+null` is `0`, `+undefined` is
 * `NaN` and `+1n` throws. `!`, `typeof`, `void` and `delete` are never
 * mutated.
 */
export let unaryOperator: Mutator = {
  create(context) {
    let { sourceCode, syntax } = context
    return {
      UnaryExpression(node, parent) {
        if (isSkipped(node, parent, context)) {
          return []
        }
        let { argument } = node
        let inner = syntax.unwrapParentheses(argument)
        let kept =
          node.operator === '~' && isTilde(inner) ? inner.argument : argument
        return [{ text: sourceCode.getText(kept), node }]
      },
    }
  },
  meta: {
    description: 'Removes a numeric unary operator (-x, +x, ~x).',
  },
}

/**
 * Tells whether a unary expression gets no mutant (catalog 4.17).
 *
 * @param node - Unary expression.
 * @param parent - Direct parent of the expression.
 * @param context - Mutator context of the file.
 * @returns Whether the expression is not mutated.
 */
function isSkipped(
  node: UnaryExpression,
  parent: Node | null,
  context: MutatorContext,
): boolean {
  switch (node.operator) {
    case '-': {
      let value = getLiteralValue(node)
      return typeof value === 'number' || typeof value === 'bigint'
    }
    case '+': {
      if (context.syntax.unwrapParentheses(node.argument).type === 'Literal') {
        return true
      }
      let view = getTypeView(context.hints.getType(node.argument))
      return view.type === 'number' && view.nullability === 'non-nullable'
    }
    case '~':
      return isTilde(parent)
    default:
      return true
  }
}

/**
 * Tells whether a node is a `~` expression.
 *
 * @param node - Node, or null.
 * @returns Whether the node is a unary `~`.
 */
function isTilde(node: Node | null): node is UnaryExpression {
  return node?.type === 'UnaryExpression' && node.operator === '~'
}
