import type { InferredType } from '../../types/hints/inferred-type'
import type { ValueKind } from '../../types/hints/value-kind'

import { createInferredType } from './create-inferred-type'

/**
 * Joins the types of the values an expression can take.
 *
 * @param types - Types to join.
 * @returns A type with every kind of every part, or the unknown type when any
 *   part is unknown or there is no part; an unknown type keeps the kinds of the
 *   parts that are known as `knownKinds`.
 */
export function unionInferredTypes(
  types: readonly InferredType[],
): InferredType {
  let kinds: ValueKind[] = []
  let isKnown = true
  for (let type of types) {
    if (type.kinds === null) {
      isKnown = false
      kinds.push(...(type.knownKinds ?? []))
    } else {
      kinds.push(...type.kinds)
    }
  }
  let joined = createInferredType(kinds)
  if (isKnown) {
    return joined
  }
  return joined.kinds ? { knownKinds: joined.kinds, kinds: null } : joined
}
