import type { NumericLiteral, BigIntLiteral, Node } from 'oxc-parser'

import { unwrapParentheses } from '../../tree/unwrap-parentheses'
import { getLiteralValue } from './get-literal-value'

/**
 * Radix of each prefix of a number literal.
 */
let radixes = new Map([
  ['x', 16],
  ['b', 2],
  ['o', 8],
])

/**
 * Pattern of a number literal written with a radix prefix, without separators.
 */
const PREFIXED_PATTERN =
  /^(?<prefix>0(?<letter>[box]))(?<digits>[\da-f]+)(?<suffix>n?)$/iu

/**
 * Builds the text of a number literal moved by one step (catalog 2.3, T7). The
 * new value is computed from the value, never from the text, and `-` applied to
 * a literal counts as one negative value. A literal with a binary, octal or
 * hexadecimal prefix keeps its radix while the new value is not negative, with
 * upper-case digits when the original has any; every other value is written in
 * its shortest form. BigInt literals keep their `n` suffix.
 *
 * @param node - Number or BigInt literal, or `-` applied directly to one.
 * @param step - Amount added to the value: `1`, or `-1` for the shifted literal
 *   of a comparison.
 * @returns The new text, or null when the node is not a number literal or the
 *   step does not change the value (beyond 2^53).
 */
export function getNumberText(node: Node, step: -1 | 1): string | null {
  let value = getLiteralValue(node)
  let next: number | bigint
  if (typeof value === 'bigint') {
    next = value + BigInt(step)
  } else if (typeof value === 'number' && value + step !== value) {
    next = value + step
  } else {
    return null
  }
  let inner = unwrapParentheses(node)
  let literal = (inner.type === 'UnaryExpression' ? inner.argument : inner) as
    NumericLiteral | BigIntLiteral
  let match = PREFIXED_PATTERN.exec(literal.raw!.replaceAll('_', ''))
  if (!match?.groups || next < 0) {
    return `${next}${typeof next === 'bigint' ? 'n' : ''}`
  }
  let { digits, letter, prefix, suffix } = match.groups as Record<
    string,
    string
  >
  let text = next.toString(radixes.get(letter!.toLowerCase()))
  return `${prefix}${/[A-F]/u.test(digits!) ? text.toUpperCase() : text}${suffix}`
}
