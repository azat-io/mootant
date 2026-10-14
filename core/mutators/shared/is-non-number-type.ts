import type { InferredType } from '../../../types/inferred-type'

/**
 * Tells whether a type is known to exclude numbers and BigInts (catalog 3.3,
 * `isNonNum`). Nullish values count as not numeric.
 *
 * @param inferred - Type of an expression.
 * @returns Whether the type is known and holds neither `number` nor `bigint`.
 */
export function isNonNumberType(inferred: InferredType): boolean {
  let { kinds } = inferred
  return (
    kinds !== null && !kinds.includes('number') && !kinds.includes('bigint')
  )
}
