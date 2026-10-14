import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'

import { WELL_KNOWN_CALLS } from '../../hints/well-known-calls'
import { unwrapExpression } from '../../tree/unwrap-expression'
import { getTypeView } from './get-type-view'

/**
 * Types of receivers on which the method names of the hint layer are trusted.
 */
let trustedReceivers = new Set([
  'boolean',
  'string',
  'number',
  'bigint',
  'array',
])

/**
 * Tells whether the type of an expression comes only from the method name of a
 * call on a receiver whose type does not confirm it (architecture 6.4, calls
 * rule 2; catalog 4.10). The type hints read `search`, `has`, `join`,
 * `includes` and similar names as their usual result on any receiver;
 * missing-await treats such a call as unknown unless its receiver is a string,
 * number, BigInt, boolean or array, because an `await` on it is evidence of a
 * promise.
 *
 * @param node - Expression, through wrappers and an optional chain.
 * @param context - Mutator context of the file.
 * @returns Whether the type of the expression should be read as unknown.
 */
export function isTypedByMethodName(
  node: Node,
  context: MutatorContext,
): boolean {
  let inner = unwrapExpression(node)
  let call = inner.type === 'ChainExpression' ? inner.expression : inner
  if (call.type !== 'CallExpression') {
    return false
  }
  let callee = unwrapExpression(call.callee)
  if (
    callee.type !== 'MemberExpression' ||
    callee.computed ||
    callee.property.type !== 'Identifier' ||
    !WELL_KNOWN_CALLS.has(`.${callee.property.name}`)
  ) {
    return false
  }
  let path = context.syntax.getMemberPath(callee)
  let root = getPathRoot(callee)
  if (
    path &&
    (WELL_KNOWN_CALLS.has(path.join('.')) ||
      WELL_KNOWN_CALLS.has(`${path.slice(0, -1).join('.')}.*`)) &&
    context.sourceCode.getBinding(root) === null
  ) {
    return false
  }
  let { type } = getTypeView(context.hints.getType(callee.object))
  return !trustedReceivers.has(type)
}

/**
 * Finds the innermost object of a member chain.
 *
 * @param node - Member expression.
 * @returns The node at the root of the chain.
 */
function getPathRoot(node: Node): Node {
  let current = node
  while (current.type === 'MemberExpression') {
    current = unwrapExpression(current.object)
  }
  return current
}
