import type { Node } from 'oxc-parser'

import type { ScopeAnalysis } from './scope-analysis'
import type { InferredType } from './inferred-type'
import type { TreeIndex } from './tree-index'

/**
 * Recursion context shared by the inference rules of the syntactic provider.
 */
export interface TypeInference {
  /**
   * Language of the file; TypeScript files trust declared types.
   */
  language: 'javascript' | 'typescript'

  /**
   * Memoized, recursion-guarded inference of another node.
   */
  infer(node: Node): InferredType

  /**
   * Names and types declared in the file.
   */
  scopes: ScopeAnalysis

  /**
   * Runtime tree of the file.
   */
  tree: TreeIndex
}
