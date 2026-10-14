import type { Node } from 'oxc-parser'

/**
 * Where a node sits in its parent.
 */
export interface NodeSlot {
  /**
   * Position in the list held by `key`, or null when the key holds one node.
   */
  index: number | null

  /**
   * Parent node, or null for the Program.
   */
  parent: Node | null

  /**
   * Property of `parent` that holds the node, or null for the Program.
   */
  key: string | null
}
