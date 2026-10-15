import type { InferredType } from '../../types/hints/inferred-type'
import type { ValueKind } from '../../types/hints/value-kind'

import { createInferredType } from './create-inferred-type'

/**
 * Joins the types of the values an expression can take.
 *
 * @param types - Types to join.
 * @returns A type with every kind of every part, or the unknown type when any
 *   part is unknown or there is no part.
 */
export function unionInferredTypes(
  types: readonly InferredType[],
): InferredType {
  let kinds: ValueKind[] = []
  for (let type of types) {
    if (type.kinds === null) {
      return { kinds: null }
    }
    kinds.push(...type.kinds)
  }
  return createInferredType(kinds)
}
