import type { InferredType } from '../../../types/inferred-type'

import { getTypeView } from './get-type-view'

/**
 * Tells whether a value may be a boolean (catalog 3.3, `mayBeBoolean`): its
 * type is `boolean` or unknown.
 *
 * @param inferred - Type of an expression.
 * @returns Whether the type of the catalog's view is `boolean` or `unknown`.
 */
export function mayBeBoolean(inferred: InferredType): boolean {
  let { type } = getTypeView(inferred)
  return type === 'boolean' || type === 'unknown'
}
