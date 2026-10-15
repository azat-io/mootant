import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'

import { getContextSlot } from '../tree/get-context-slot'

/**
 * Nodes whose `key` names a property or a class member.
 */
let keyOwnerTypes = new Set([
  'PropertyDefinition',
  'MethodDefinition',
  'AccessorProperty',
  'Property',
])

/**
 * Tells whether a node is the key of a property, method or class member,
 * computed or not, looking through parentheses and TypeScript expression
 * wrappers.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns Whether the node names a property or a member.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isPropertyKey(tree: TreeIndex, node: Node): boolean {
  let { parent, key } = getContextSlot(tree, node)
  return key === 'key' && keyOwnerTypes.has(parent!.type)
}
