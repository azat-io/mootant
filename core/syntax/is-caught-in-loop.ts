import type { Node } from 'oxc-parser'

import type { TreeIndex } from '../../types/syntax/tree-index'

import { isTestedLoop } from './is-tested-loop'
import { getSlot } from '../tree/get-slot'
import { isFunction } from './is-function'

/**
 * Keys of a loop whose code runs again while the loop goes on.
 */
let loopPartKeys = new Set(['update', 'body', 'test'])

/**
 * Tells whether an error thrown at a node may be caught without leaving a loop
 * around it: the node lies in the `try` block of a try statement, or in its
 * `catch` block when it has a `finally` block, and that statement lies in the
 * test, the body or the update of a `while`, `do...while` or `for` loop,
 * without a function boundary in between.
 *
 * @param tree - Runtime tree of the file.
 * @param node - Node of the runtime tree.
 * @returns Whether a loop may go on after the node throws.
 * @throws Error - When the node is not part of the runtime tree.
 */
export function isCaughtInLoop(tree: TreeIndex, node: Node): boolean {
  let caught = false
  let slot = getSlot(tree, node)
  while (slot.parent && !isFunction(slot.parent)) {
    let { parent, key } = slot
    if (
      parent.type === 'TryStatement' &&
      (key === 'block' || (key === 'handler' && parent.finalizer !== null))
    ) {
      caught = true
    } else if (caught && isTestedLoop(parent) && loopPartKeys.has(key!)) {
      return true
    }
    slot = tree.slots.get(parent)!
  }
  return false
}
