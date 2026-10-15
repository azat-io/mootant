import type { InferredType } from '../../../types/hints/inferred-type'

import { isNonNullable } from './is-non-nullable'

/**
 * Tells whether a value may be `null` or `undefined` (catalog 3.3,
 * `mayBeNullish`). An unknown type may be.
 *
 * @param inferred - Type of an expression.
 * @returns Whether the type is not known to be non-nullable.
 */
export function mayBeNullish(inferred: InferredType): boolean {
  return !isNonNullable(inferred)
}
