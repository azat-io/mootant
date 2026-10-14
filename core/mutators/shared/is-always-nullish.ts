import type { InferredType } from '../../../types/inferred-type'

import { getTypeView } from './get-type-view'

/**
 * Tells whether every value of a type is `null` or `undefined` (catalog 3.3,
 * `alwaysNullish`).
 *
 * @param inferred - Type of an expression.
 * @returns Whether the type of the catalog's view is `nullish`.
 */
export function isAlwaysNullish(inferred: InferredType): boolean {
  return getTypeView(inferred).type === 'nullish'
}
