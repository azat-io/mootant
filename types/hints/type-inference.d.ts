import type { Node } from 'oxc-parser'

import type { ScopeAnalysis } from '../syntax/scope-analysis'
import type { TreeIndex } from '../syntax/tree-index'
import type { InferredType } from './inferred-type'

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
