import type { Node } from 'oxc-parser'

import type { InferredType } from './inferred-type'
import type { ValueKind } from './value-kind'

/**
 * Type questions mutators ask. Each answer that needs knowledge is false when
 * the type is unknown.
 */
export interface TypeHints {
  /**
   * Whether the type is known and every kind it allows is one of `kinds`.
   */
  isOnly(node: Node, kinds: readonly ValueKind[]): boolean

  /**
   * Type of a TypeScript type node, such as a return or a parameter annotation.
   * Type nodes lie outside the runtime tree.
   */
  getAnnotationType(typeNode: Node): InferredType

  /**
   * Whether the type is known and excludes the kind.
   */
  cannotBe(node: Node, kind: ValueKind): boolean

  /**
   * Whether the type is known and includes the kind.
   */
  canBe(node: Node, kind: ValueKind): boolean

  /**
   * Type of the expression.
   */
  getType(node: Node): InferredType
}
