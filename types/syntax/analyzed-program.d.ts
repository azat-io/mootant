import type { Node } from 'oxc-parser'

import type { ScopeAnalysis } from './scope-analysis'
import type { TreeIndex } from './tree-index'

/**
 * Program that the facts about its names read: its runtime tree, its scope
 * analysis and the scopes whose names code outside it may read and write.
 */
export interface AnalyzedProgram {
  /**
   * Scopes of the program whose names code outside them may read and write (see
   * `getSharedScopes`); none for a JavaScript or TypeScript file.
   */
  shared: ReadonlySet<Node>

  /**
   * Scope analysis of the program.
   */
  scopes: ScopeAnalysis

  /**
   * Runtime tree of the program.
   */
  tree: TreeIndex
}
