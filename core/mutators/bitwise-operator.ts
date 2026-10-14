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
 * operand literal `0`.
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
        let rightZero = isZero(getLiteralValue(right))
        if (
          (rightZero && (operator === '<<' || operator === '>>')) ||
          (shifts.has(operator) && getLiteralValue(left) === 0) ||
          (operator === '^' && (rightZero || isZero(getLiteralValue(left))))
        ) {
          return []
        }
        if (operator === '|' && getLiteralValue(right) === 0) {
          return [{ text: sourceCode.text.slice(node.start, left.end), node }]
        }
        return [{ text: sourceCode.replaceOperator(node, swap), node }]
      },
    }
  },
  meta: {
    description:
      'Swaps a bitwise or shift operator, or drops a | 0 truncation.',
  },
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
