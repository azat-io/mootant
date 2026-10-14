import type { InferredType } from '../../../types/inferred-type'

import { getTypeView } from './get-type-view'

/**
 * Tells whether every value of a type is truthy (catalog 3.3, `alwaysTruthy`):
 * an object, array or function that cannot be nullish.
 *
 * @param inferred - Type of an expression.
 * @returns Whether the value is always truthy.
 */
export function isAlwaysTruthy(inferred: InferredType): boolean {
  let { nullability, type } = getTypeView(inferred)
  return (
    nullability === 'non-nullable' &&
    ['function', 'object', 'array'].includes(type)
  )
}
