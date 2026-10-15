import type { Node } from 'oxc-parser'

import type { InferredType } from './inferred-type'

/**
 * Source of type knowledge for one file. The syntactic provider is built in; a
 * real type checker can implement the same interface later.
 */
export interface TypeHintProvider {
  /**
   * Type of a TypeScript type node of the file, such as a return or a parameter
   * annotation; unknown for anything else.
   */
  getAnnotationType(typeNode: Node): InferredType

  /**
   * Type of an expression of the runtime tree; unknown for anything else.
   */
  getType(node: Node): InferredType
}
