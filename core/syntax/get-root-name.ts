import type { Node } from 'oxc-parser'

import { unwrapExpression } from '../tree/unwrap-expression'

/**
 * Finds the name at the root of a member, call or optional chain: through
 * parentheses and TypeScript expression wrappers, the object of members, the
 * expression of chains and the callee of calls.
 *
 * @param node - Expression to follow.
 * @returns The name of the root identifier, `this`, or null for any other root.
 */
export function getRootName(node: Node): string | null {
  let current = unwrapExpression(node)
  for (;;) {
    switch (current.type) {
      case 'MemberExpression':
        current = unwrapExpression(current.object)
        break
      case 'ChainExpression':
        current = unwrapExpression(current.expression)
        break
      case 'CallExpression':
        current = unwrapExpression(current.callee)
        break
      case 'ThisExpression':
        return 'this'
      case 'Identifier':
        return current.name
      default:
        return null
    }
  }
}
