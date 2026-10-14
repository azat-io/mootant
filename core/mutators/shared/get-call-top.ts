import type { CallExpression, Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator-context'

/**
 * Finds the node where the value of a call goes (catalog 4.9 and 4.16, the
 * position of a call): the root of its optional chain when the call, through
 * wrappers, is the root's top element, otherwise the call itself.
 *
 * @param call - Call expression.
 * @param context - Mutator context of the file.
 * @returns The node whose position is the position of the call's value.
 */
export function getCallTop(
  call: CallExpression,
  context: MutatorContext,
): Node {
  let root = context.syntax.getChainRoot(call)
  return root && context.syntax.unwrapExpression(root.expression) === call ?
      root
    : call
}
