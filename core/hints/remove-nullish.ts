import type { InferredType } from '../../types/hints/inferred-type'

import { createInferredType } from './create-inferred-type'

/**
 * Removes `null` and `undefined` from a type, as `x!` and `NonNullable<T>` do.
 *
 * @param type - Type to narrow.
 * @returns The type without nullish kinds; unknown stays unknown, and a type
 *   that was only nullish becomes unknown.
 */
export function removeNullish(type: InferredType): InferredType {
  return createInferredType(
    type.kinds?.filter(kind => kind !== 'null' && kind !== 'undefined') ?? null,
  )
}
