import type { Node } from 'oxc-parser'

import type { LiteralValue } from './shared/get-literal-value'
import type { Mutator } from '../../types/mutator'

import { getLiteralValue } from './shared/get-literal-value'
import { isNumericPair } from './shared/is-numeric-pair'
import { isNumberType } from './shared/is-number-type'

/**
 * Operator written in place of each arithmetic operator.
 */
let swaps = new Map<string, string>([
  ['**', '*'],
  ['+', '-'],
  ['-', '+'],
  ['*', '/'],
  ['/', '*'],
  ['%', '*'],
])

/**
 * Right operand literals that make the swap of each operator change nothing.
 */
let identities = new Map<string, Set<LiteralValue>>([
  ['*', new Set([-1n, -1, 1n, 1])],
  ['/', new Set([-1n, -1, 1n, 1])],
  ['**', new Set([1n, 1])],
  ['+', new Set([0n, 0])],
  ['-', new Set([0n, 0])],
])

/**
 * Swaps an arithmetic operator, or drops the right operand of a + that is not
 * known to be numeric (catalog 4.1). A numeric `+` becomes `-`; any other `+`
 * keeps only its left operand, unless the right operand is a string literal or
 * a template without expressions (string-literal owns it, O11) or the
 * expression builds an error message (NOISE). The other operators swap: `-` to
 * `+`, `*` to `/`, `/`, `%` and `**` to `*`. Swaps are skipped for identities
 * (`+ 0`, `- 0` after a number, `* 1`, `/ -1`, `** 1`, EQ) and for a `+` or `-`
 * before a unary `-` that is not a negative number literal (unary-operator owns
 * it, O14).
 */
export let arithmeticOperator: Mutator = {
  create(context) {
    let { sourceCode, syntax, hints } = context
    return {
      BinaryExpression(node) {
        let swap = swaps.get(node.operator)
        if (swap === undefined) {
          return []
        }
        let { operator, right, left } = node
        let leftType = hints.getType(left)
        if (
          operator === '+' &&
          !isNumericPair(leftType, hints.getType(right))
        ) {
          if (
            typeof getLiteralValue(syntax.unwrapExpression(right)) ===
              'string' ||
            syntax.isErrorMessage(node)
          ) {
            return []
          }
          return [{ text: sourceCode.text.slice(node.start, left.end), node }]
        }
        let value = getLiteralValue(right)
        if (
          value !== null &&
          identities.get(operator)?.has(value) &&
          (operator !== '-' || isNumberType(leftType))
        ) {
          return []
        }
        if (isOperandNegation(operator, syntax.unwrapExpression(right))) {
          return []
        }
        return [{ text: sourceCode.replaceOperator(node, swap), node }]
      },
    }
  },
  meta: {
    description:
      'Swaps an arithmetic operator, or drops the right operand of a + that is not known to be numeric.',
  },
}

/**
 * Tells whether the right operand of a `+` or `-` is a unary `-` that
 * unary-operator removes (catalog 5.2 O14): `b - -c` swapped to `b + -c` is the
 * program of `-c` turned into `c`.
 *
 * @param operator - Operator of the arithmetic expression.
 * @param right - Right operand, through wrappers.
 * @returns Whether the swap belongs to unary-operator.
 */
function isOperandNegation(operator: string, right: Node): boolean {
  return (
    (operator === '+' || operator === '-') &&
    right.type === 'UnaryExpression' &&
    right.operator === '-' &&
    getLiteralValue(right) === null
  )
}
