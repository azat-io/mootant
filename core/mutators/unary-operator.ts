import type { UnaryExpression, Node } from 'oxc-parser'

import type { MutatorContext } from '../../types/mutator/mutator-context'
import type { SkipNote } from '../../types/mutant/skip-note'
import type { Mutator } from '../../types/mutator/mutator'

import { isComparatorResult } from './shared/is-comparator-result'
import { getLiteralValue } from './shared/get-literal-value'
import { getTypeView } from './shared/get-type-view'

/**
 * Removes a numeric unary operator (-x, +x, ~x) (catalog 4.17): the mutant is
 * the argument with its parentheses. `~~x` is one unit, also as `~(~x)`: the
 * outer `~` gives `x` and the inner one nothing. Any other operator removes
 * only itself: `-~x` gives `~x`, and `-1` gives `1`, which number-literal's `-1
 * -> 0` does not cover. Skipped: `-1` as a sort comparator result, where `1`
 * and number-literal's `0` both stop the result from being negative; `+x` when
 * `x` is a number literal or hinted to be only a number, never nullish or a
 * BigInt (EQ); and `+x` of any other literal (NOISE: `+'3'` is a number, `+1n`
 * throws). The inner `~` of `~~x` and `!`, `typeof`, `void` and `delete` are
 * never mutated.
 */
export let unaryOperator: Mutator = {
  create(context) {
    let { sourceCode, syntax } = context
    return {
      UnaryExpression(node, parent) {
        if (
          (node.operator !== '-' &&
            node.operator !== '+' &&
            node.operator !== '~') ||
          (node.operator === '~' && isTilde(parent))
        ) {
          return []
        }
        let { argument } = node
        let inner = syntax.unwrapParentheses(argument)
        let kept =
          node.operator === '~' && isTilde(inner) ? inner.argument : argument
        let text = sourceCode.getText(kept)
        let skip = getSkip(node, context)
        return [skip ? { text, skip, node } : { text, node }]
      },
    }
  },
  meta: {
    description: 'Removes a numeric unary operator (-x, +x, ~x).',
  },
}

/**
 * Decides whether the removal of a `-` or `+` is skipped (catalog 4.17).
 *
 * @param node - Unary `-`, `+` or `~` expression.
 * @param context - Mutator context of the file.
 * @returns Rule and reason of the skip, or null when the mutant is emitted.
 */
function getSkip(
  node: UnaryExpression,
  context: MutatorContext,
): SkipNote | null {
  if (
    node.operator === '-' &&
    getLiteralValue(node) === -1 &&
    isComparatorResult(node, context)
  ) {
    return {
      reason:
        "a sort comparator result that is no longer negative behaves like number-literal's -1 -> 0",
      by: { mutator: 'number-literal', node },
      rule: 'comparator-sign-flip',
    }
  }
  if (node.operator === '+') {
    let argument = context.syntax.unwrapParentheses(node.argument)
    if (argument.type === 'Literal') {
      return typeof getLiteralValue(argument) === 'number' ?
          {
            reason: 'the operand is a number literal',
            rule: 'number-literal-plus',
          }
        : {
            reason:
              'it converts a literal that is not a number, which a test rarely relies on',
            rule: 'literal-coercion',
          }
    }
    let view = getTypeView(context.hints.getType(node.argument))
    return view.type === 'number' && view.nullability === 'non-nullable' ?
        {
          reason:
            'the type hints make the operand a number that is never nullish',
          rule: 'numeric-plus',
        }
      : null
  }
  return null
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
