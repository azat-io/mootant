import type { Node } from 'oxc-parser'

import { unwrapExpression } from './unwrap-expression'

/**
 * Reads the name a callee is called by (catalog 4.2 and 2.2: the callee name of
 * hook dependency lists and error messages).
 *
 * @param node - Callee of a call or `new`, through wrappers.
 * @returns The name of an identifier, the property name of a non-computed
 *   member, or null for any other callee.
 */
export function getCalleeName(node: Node): string | null {
  let callee = unwrapExpression(node)
  if (callee.type === 'Identifier') {
    return callee.name
  }
  return callee.type === 'MemberExpression' && !callee.computed ?
      callee.property.name
    : null
}
