import type { CallExpression, Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

/**
 * Finds the node a method-call mutant of a call replaces: the call itself, or
 * the root of its optional chain when an optional link at or below the call can
 * skip it (catalog 4.9, T10).
 *
 * @param call - Method call.
 * @param context - Mutator context of the file.
 * @returns The replaced node, which may still lie where the mutant switch
 *   cannot wrap it, as for the operand of `delete`.
 */
export function getCallTarget(
  call: CallExpression,
  context: MutatorContext,
): Node {
  let { syntax } = context
  return syntax.isValuePosition(call) ? call : (
      (syntax.getChainRoot(call) ?? call)
    )
}
