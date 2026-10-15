import type { InferredType } from '../../../types/hints/inferred-type'

import { isNonNumberType } from './is-non-number-type'
import { isNumberType } from './is-number-type'

/**
 * Tells whether two operands are compared or added as numbers (catalog 3.3,
 * `numeric`): one side is numeric and neither side is known to be something
 * else. Two unknown sides are not numeric.
 *
 * @param left - Type of the left operand.
 * @param right - Type of the right operand.
 * @returns Whether the pair is numeric.
 */
export function isNumericPair(
  left: InferredType,
  right: InferredType,
): boolean {
  return (
    (isNumberType(left) || isNumberType(right)) &&
    !isNonNumberType(left) &&
    !isNonNumberType(right)
  )
}
