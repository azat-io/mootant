import type { Node } from 'oxc-parser'

import type { ValueBounds } from '../../types/syntax/value-bounds'

import { parseRegexPattern } from '../regex/parse-regex-pattern'
import { unwrapExpression } from '../tree/unwrap-expression'
import { NEVER_EMPTY_METHODS } from './never-empty-methods'
import { readNumberLiteral } from './read-number-literal'
import { canMatchEmpty } from '../regex/can-match-empty'
import { getValueBound } from './get-value-bound'
import { getMatchRegex } from './get-match-regex'

/**
 * Finds why an expression is never falsy when it is not null or undefined
 * (catalog 4.8, N2), through parentheses and TypeScript wrappers, so that `??`
 * and `||` agree on its value:
 *
 * - A call of a method that never returns an empty string (see
 *   `NEVER_EMPTY_METHODS`), also in an optional chain, by name.
 * - The element 0 of the result of a match call (see `getMatchRegex`), also after
 *   `?.`, is the whole match of the regular expression, which is never empty
 *   when its pattern cannot match an empty string (see `canMatchEmpty`).
 * - A value whose lower bound is above 0 (see `getValueBound`), such as the `get`
 *   of a count map whose values are at least 1, is a number that is never 0 or
 *   NaN.
 *
 * @param bounds - Bounds of the names of the program whose values change.
 * @param node - Expression to check.
 * @returns Why the expression is never falsy, worded as a clause such as
 *   "`toISOString` never returns an empty string", or null when nothing tells
 *   it.
 */
export function getNeverFalsyFact(
  bounds: ValueBounds,
  node: Node,
): string | null {
  let method = getNeverEmptyMethod(node)
  if (method !== null) {
    return `\`${method}\` never returns an empty string`
  }
  if (isWholeMatch(bounds, node)) {
    return 'it is the whole match of a regex that cannot match an empty string'
  }
  let bound = getValueBound(bounds, node)
  return bound && bound.lower > 0 ?
      `it is a number of at least ${bound.lower}, since ${bound.because}`
    : null
}

/**
 * Tells whether an expression is the whole match that a match call finds with a
 * pattern that cannot match an empty string: element 0 of its result, also
 * after `?.`.
 *
 * @param bounds - Bounds of the program, with its tree, scope analysis and the
 *   scopes whose names code outside them may read and write.
 * @param node - Expression to check.
 * @returns Whether the value is a non-empty whole match whenever it exists.
 */
function isWholeMatch(bounds: ValueBounds, node: Node): boolean {
  let member = unwrapChain(node)
  if (
    member.type !== 'MemberExpression' ||
    !member.computed ||
    readNumberLiteral(member.property) !== 0
  ) {
    return false
  }
  let match = getMatchRegex(bounds, member.object)
  let pattern =
    match ?
      parseRegexPattern(match.literal.regex.pattern, match.literal.regex.flags)
    : null
  return pattern !== null && !canMatchEmpty(pattern)
}

/**
 * Finds the method of a call that never returns an empty string, also in an
 * optional chain.
 *
 * @param node - Expression to check.
 * @returns The name of the method, or null for any other expression.
 */
function getNeverEmptyMethod(node: Node): string | null {
  let call = unwrapChain(node)
  if (call.type !== 'CallExpression') {
    return null
  }
  let callee = unwrapExpression(call.callee)
  return (
      callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.property.type === 'Identifier' &&
        NEVER_EMPTY_METHODS.has(callee.property.name)
    ) ?
      callee.property.name
    : null
}

/**
 * Strips parentheses and TypeScript wrappers from an expression and, when it is
 * an optional chain, from the expression inside the chain.
 *
 * @param node - Expression.
 * @returns The expression inside the wrappers and the chain.
 */
function unwrapChain(node: Node): Node {
  let current = unwrapExpression(node)
  return current.type === 'ChainExpression' ?
      unwrapExpression(current.expression)
    : current
}
