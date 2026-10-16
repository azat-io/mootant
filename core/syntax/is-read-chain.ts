import type { Node } from 'oxc-parser'

import { unwrapExpression } from '../tree/unwrap-expression'

/**
 * Tells whether an expression only reads a value without calls: a name, `this`,
 * or a member chain on one of them whose computed keys are string or number
 * literals or such reads (`a`, `a.b`, `a?.b`, `a[0]`, `a[key]`, `this.x`).
 * Parentheses and TypeScript expression wrappers are looked through. Getters
 * are not known, so they do not count.
 *
 * @param node - Expression to check.
 * @returns Whether the expression is a plain read.
 */
export function isReadChain(node: Node): boolean {
  let value = unwrapExpression(node)
  while (
    value.type === 'MemberExpression' ||
    value.type === 'ChainExpression'
  ) {
    if (value.type === 'ChainExpression') {
      value = unwrapExpression(value.expression)
    } else if (value.computed && !isReadKey(value.property)) {
      return false
    } else {
      value = unwrapExpression(value.object)
    }
  }
  return value.type === 'ThisExpression' || value.type === 'Identifier'
}

/**
 * Tells whether the computed key of a member only reads a value: a string or
 * number literal, or a plain read.
 *
 * @param node - Computed key.
 * @returns Whether the key is a literal or a plain read.
 */
function isReadKey(node: Node): boolean {
  let key = unwrapExpression(node)
  return (
    (key.type === 'Literal' &&
      (typeof key.value === 'string' || typeof key.value === 'number')) ||
    isReadChain(key)
  )
}
