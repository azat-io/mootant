import type { InferredType } from '../../../types/inferred-type'

import { getTypeView } from './get-type-view'

/**
 * Tells whether a value is known never to be `null` or `undefined` (catalog
 * 3.3, `nonNullable`).
 *
 * @param inferred - Type of an expression.
 * @returns Whether the nullability is `non-nullable`; a type that holds only
 *   nullish values never is.
 */
export function isNonNullable(inferred: InferredType): boolean {
  return getTypeView(inferred).nullability === 'non-nullable'
}
