import type { InferredType } from '../../../types/inferred-type'

import { getTypeView } from './get-type-view'

/**
 * Tells whether a type certainly has falsy values that are not nullish (catalog
 * 3.3, `certainFNN`): it is a string, number, BigInt or boolean type.
 *
 * @param inferred - Type of an expression.
 * @returns Whether the type of the catalog's view is `string`, `number`,
 *   `bigint` or `boolean`.
 */
export function hasDefinedFalsyValue(inferred: InferredType): boolean {
  return ['boolean', 'string', 'number', 'bigint'].includes(
    getTypeView(inferred).type,
  )
}
