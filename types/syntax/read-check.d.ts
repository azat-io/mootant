import type { Node } from 'oxc-parser'

import type { TreeIndex } from './tree-index'

/**
 * Check of one read of a name, given the runtime tree of the program and the
 * identifier of the read.
 */
export type ReadCheck = (tree: TreeIndex, reference: Node) => boolean
