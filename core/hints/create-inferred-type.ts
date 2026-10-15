import type { InferredType } from '../../types/hints/inferred-type'
import type { ValueKind } from '../../types/hints/value-kind'

import { compareCodeUnits } from '../compare-code-units'

/**
 * Builds the normalized form of a type: distinct kinds sorted by name, or
 * unknown when there are none.
 *
 * @param kinds - Kinds the value can have, in any order and possibly repeated;
 *   null when nothing is known.
 * @returns The type with distinct sorted kinds, or the unknown type when the
 *   list is null or empty (an empty list comes, for example, from `never`).
 */
export function createInferredType(
  kinds: readonly ValueKind[] | null,
): InferredType {
  if (kinds === null || kinds.length === 0) {
    return { kinds: null }
  }
  return {
    kinds: kinds
      .filter((kind, index) => kinds.indexOf(kind) === index)
      .toSorted(compareCodeUnits),
  }
}
