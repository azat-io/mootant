import type { Node } from 'oxc-parser'

import { visitorKeys } from 'oxc-parser'

import type { NodeSlot } from '../../types/node-slot'

/**
 * Node waiting on the walk stack, with the slot it was found in.
 */
interface PendingNode {
  /**
   * Raw slot of the node.
   */
  slot: NodeSlot

  /**
   * Node to visit.
   */
  node: Node
}

/**
 * Visits a node and its descendants in pre-order, children in `visitorKeys`
 * order and array order. The walk keeps an explicit stack instead of recursing,
 * so deep trees cannot overflow the call stack.
 *
 * @param root - Node to start from; its slot has no parent.
 * @param enter - Called for every visited node with its raw slot, whose parent
 *   may be a ParenthesizedExpression; returning false skips the children.
 */
export function walkTree(
  root: Node,
  enter: (node: Node, slot: NodeSlot) => boolean,
): void {
  let stack: PendingNode[] = [
    { slot: { parent: null, index: null, key: null }, node: root },
  ]
  let pending = stack.pop()
  while (pending) {
    let { node, slot } = pending
    if (enter(node, slot)) {
      let children: PendingNode[] = []
      let keys = visitorKeys[node.type] ?? []
      for (let key of keys) {
        let value: unknown = Reflect.get(node, key)
        if (Array.isArray(value)) {
          let list: unknown[] = value
          for (let [index, child] of list.entries()) {
            if (isNode(child)) {
              children.push({ slot: { parent: node, index, key }, node: child })
            }
          }
        } else if (isNode(value)) {
          children.push({
            slot: { parent: node, index: null, key },
            node: value,
          })
        }
      }
      for (let child of children.toReversed()) {
        stack.push(child)
      }
    }
    pending = stack.pop()
  }
}

/**
 * Tells whether a value read from a node property is itself a node.
 *
 * @param value - Property value of a node.
 * @returns Whether the value is an object with a string `type`.
 */
function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  )
}
