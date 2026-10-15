import type { InferredType } from '../../../types/hints/inferred-type'
import type { ValueKind } from '../../../types/hints/value-kind'

/**
 * Result of `typeof` for each kind that is not nullish.
 */
let typeofNames = new Map<ValueKind, string>([
  ['function', 'function'],
  ['boolean', 'boolean'],
  ['promise', 'object'],
  ['string', 'string'],
  ['number', 'number'],
  ['bigint', 'bigint'],
  ['object', 'object'],
  ['symbol', 'symbol'],
  ['array', 'object'],
])

/**
 * Finds the one result `typeof` gives for every value of a type (catalog 3.3,
 * `typeofName`).
 *
 * @param inferred - Type of the operand of `typeof`.
 * @returns The `typeof` result shared by every kind, or null when the type is
 *   unknown, may be nullish, or its kinds give different results.
 */
export function getTypeofName(inferred: InferredType): string | null {
  let { kinds } = inferred
  if (kinds === null) {
    return null
  }
  let names = new Set<undefined | string>()
  for (let kind of kinds) {
    names.add(typeofNames.get(kind))
  }
  let [name] = names
  return name !== undefined && names.size === 1 ? name : null
}
