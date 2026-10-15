import type { Node } from 'oxc-parser'

import type { NodeSlot } from './node-slot'

/**
 * Runtime nodes of a file and the raw slot of each one.
 */
export interface TreeIndex {
  /**
   * Raw slot of every runtime node. Unlike `getSlot`, the parent may be a
   * ParenthesizedExpression.
   */
  slots: Map<Node, NodeSlot>

  /**
   * Nodes dispatched to visitors, in pre-order with children in `visitorKeys`
   * order. Names that are never values are indexed but not dispatched.
   */
  order: Node[]
}
