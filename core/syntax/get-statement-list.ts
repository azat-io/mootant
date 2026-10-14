import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/tree-index'

import { getSlot } from '../tree/get-slot'

/**
 * Finds the statements of the list that holds a statement: the body of a
 * Program, block, static block or namespace, or the consequent of a switch
 * case. The position of the statement in the list is the index of its slot.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Statement of the runtime tree.
 * @returns The statements of the list, or null when the statement is the single
 *   body of an `if`, a loop, a label or `with`, or not a statement.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function getStatementList(tree: TreeIndex, node: Node): Node[] | null {
  let { parent, key } = getSlot(tree, node)
  switch (parent?.type) {
    case 'BlockStatement':
    case 'TSModuleBlock':
    case 'StaticBlock':
    case 'Program':
      return parent.body
    case 'SwitchCase':
      return key === 'consequent' ? parent.consequent : null
    default:
      return null
  }
}
