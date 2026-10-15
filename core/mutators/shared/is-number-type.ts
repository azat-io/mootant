import type { InferredType } from '../../../types/hints/inferred-type'

/**
 * Tells whether a type holds only numbers and BigInts besides nullish values
 * (catalog 3.3, `isNum`).
 *
 * @param inferred - Type of an expression.
 * @returns Whether the type is known and every value that is not nullish is a
 *   number or a BigInt.
 */
export function isNumberType(inferred: InferredType): boolean {
  let { kinds } = inferred
  if (kinds === null) {
    return false
  }
  let numeric = false
  for (let kind of kinds) {
    if (kind === 'number' || kind === 'bigint') {
      numeric = true
    } else if (kind !== 'null' && kind !== 'undefined') {
      return false
    }
  }
  return numeric
}
