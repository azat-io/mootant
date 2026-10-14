import type { InferredType } from '../../../types/inferred-type'

import { getTypeView } from './get-type-view'

/**
 * Tells whether the values of a type that are not nullish are strings (catalog
 * 3.3, `isString`).
 *
 * @param inferred - Type of an expression.
 * @returns Whether the type of the catalog's view is `string`.
 */
export function isStringType(inferred: InferredType): boolean {
  return getTypeView(inferred).type === 'string'
}
