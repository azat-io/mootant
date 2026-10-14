import type { PrivateInExpression, BinaryExpression } from 'oxc-parser'

import type { SkipNote } from '../../types/skip-note'
import type { Mutator } from '../../types/mutator'

import { getLiteralValue } from './shared/get-literal-value'

/**
 * Operator written in place of each bitwise or shift operator.
 */
let swaps = new Map<string, string>([
  ['>>>', '>>'],
  ['<<', '>>'],
  ['>>', '<<'],
  ['&', '|'],
  ['|', '&'],
  ['^', '|'],
])

/**
 * Shift operators.
 */
let shifts = new Set(['>>>', '<<', '>>'])

/**
 * Swaps a bitwise or shift operator, or drops a | 0 truncation (catalog 4.4):
 * `&` to `|`, `|` to `&`, `^` to `|`, `<<` to `>>`, `>>` to `<<` and `>>>` to
 * `>>`. A `| 0` keeps only its left operand (the missing truncation). Skipped
 * as equivalent (EQ): `<<` and `>>` with a right operand literal `0`, any shift
 * with a left operand number literal `0` (it is `0` for every count; not `0n`,
 * since `0n >>> n` throws while `0n >> n` does not), and `^` with either
 * operand literal `0`; these follow as skipped replacements.
 */
export let bitwiseOperator: Mutator = {
  create(context) {
    let { sourceCode } = context
    return {
      BinaryExpression(node) {
        let swap = swaps.get(node.operator)
        if (swap === undefined) {
          return []
        }
        let { operator, right, left } = node
        let text =
          operator === '|' && getLiteralValue(right) === 0 ?
            sourceCode.text.slice(node.start, left.end)
          : sourceCode.replaceOperator(node, swap)
        let skip = getZeroSkip(node)
        return [skip ? { text, skip, node } : { text, node }]
      },
    }
  },
  meta: {
    description:
      'Swaps a bitwise or shift operator, or drops a | 0 truncation.',
  },
}

/**
 * Decides whether the swap of a bitwise or shift operator is skipped because a
 * literal `0` operand makes it equivalent (catalog 4.4, EQ).
 *
 * @param node - Bitwise or shift expression.
 * @returns Rule and reason of the skip, or null when the mutant is emitted.
 */
function getZeroSkip(
  node: PrivateInExpression | BinaryExpression,
): SkipNote | null {
  let { operator, right, left } = node
  let rightZero = isZero(getLiteralValue(right))
  if (rightZero && (operator === '<<' || operator === '>>')) {
    return {
      reason: 'a shift by 0 gives the same result in either direction',
      rule: 'identity-operand',
    }
  }
  if (shifts.has(operator) && getLiteralValue(left) === 0) {
    return {
      reason: 'a shift of 0 is 0 whatever the count',
      rule: 'identity-operand',
    }
  }
  if (operator === '^' && (rightZero || isZero(getLiteralValue(left)))) {
    return {
      reason: 'with an operand 0, ^ and | give the same result',
      rule: 'identity-operand',
    }
  }
  return null
}

/**
 * Tells whether a literal value is zero, as a number or a BigInt.
 *
 * @param value - Literal value of an operand, or null.
 * @returns Whether the value is `0`, `-0` or `0n`.
 */
function isZero(value: unknown): boolean {
  return value === 0 || value === 0n
}
