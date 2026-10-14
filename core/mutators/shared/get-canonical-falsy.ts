import type { LiteralValue } from './get-literal-value'
import type { TypeView } from './get-type-view'

/**
 * The only falsy value of each type that is not nullish, `NaN` aside.
 */
let canonicalFalsyValues = new Map<TypeView['type'], LiteralValue>([
  ['boolean', false],
  ['bigint', 0n],
  ['string', ''],
  ['number', 0],
])

/**
 * Finds the only falsy value of a type that is not nullish (catalog 3.3,
 * `canonicalFalsy`): `''` for a string, `0` for a number (`NaN` ignored), `0n`
 * for a BigInt and `false` for a boolean.
 *
 * @param type - Type of the catalog's view.
 * @returns The value, or null for the other types.
 */
export function getCanonicalFalsy(type: TypeView['type']): LiteralValue | null {
  return canonicalFalsyValues.get(type) ?? null
}
