import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

/**
 * Tells whether a node is an identifier of a global that no binding of the file
 * shadows. It checks this one reference against the declarations of the file
 * (see `SourceCode.getBinding`), whereas `isGlobalName` tells whether a name
 * surely refers to the global wherever a mutant writes it into the program.
 *
 * @param node - Expression, unwrapped.
 * @param name - Global the identifier must name, such as `undefined`.
 * @param context - Mutator context of the file.
 * @returns Whether the node refers to the global.
 */
export function isGlobalIdentifier(
  node: Node,
  name: string,
  context: MutatorContext,
): boolean {
  return (
    node.type === 'Identifier' &&
    node.name === name &&
    context.sourceCode.getBinding(node) === null
  )
}
