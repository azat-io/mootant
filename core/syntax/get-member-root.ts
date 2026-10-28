import type { Node } from 'oxc-parser'

import { unwrapExpression } from '../tree/unwrap-expression'

/**
 * Finds the expression at the root of a member chain: through parentheses and
 * TypeScript expression wrappers, the object of every member, computed or not,
 * and the expression of every optional chain. A call ends the walk, so the root
 * of `a.b().c` is the call `a.b()`.
 *
 * @param node - Expression to follow.
 * @returns The innermost object of the chain, or the expression itself when it
 *   is not a member or a chain, without wrappers.
 */
export function getMemberRoot(node: Node): Node {
  let current = unwrapExpression(node)
  while (
    current.type === 'MemberExpression' ||
    current.type === 'ChainExpression'
  ) {
    current = unwrapExpression(
      current.type === 'ChainExpression' ? current.expression : current.object,
    )
  }
  return current
}
