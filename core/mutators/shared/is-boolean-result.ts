import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

import { getReturnValueKind } from './get-return-value-kind'

/**
 * Tells whether a node is a returned value whose return-value kind is `boolean`
 * (catalog 4.14): return-value then owns the constants `true` and `false` of
 * that position, which the lookup-key rule of string-literal (O8) and the
 * case-swap rule of method-call (O17) read.
 *
 * @param node - Node of the runtime tree.
 * @param context - Mutator context of the file.
 * @returns Whether the node is a boolean result.
 */
export function isBooleanResult(node: Node, context: MutatorContext): boolean {
  return getReturnValueKind(node, context) === 'boolean'
}
