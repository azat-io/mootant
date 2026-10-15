import type { InferredType } from '../../../types/hints/inferred-type'
import type { ValueKind } from '../../../types/hints/value-kind'

import { OBJECT_KINDS } from '../../hints/object-kinds'

/**
 * Type of a value as the catalog reads it: one kind or a coarse class, and
 * whether the value may be nullish.
 */
export interface TypeView {
  /**
   * Single kind of the non-nullish values, `object` for any mix of object-like
   * kinds, `nullish` when only `null` and `undefined` remain, and `unknown` for
   * everything else, also for any non-nullish value.
   */
  type:
    | 'function'
    | 'boolean'
    | 'unknown'
    | 'nullish'
    | 'string'
    | 'number'
    | 'bigint'
    | 'object'
    | 'array'

  /**
   * `nullable` when the kinds hold `null` or `undefined`, `non-nullable` when
   * they hold neither, `unknown` when the kinds are unknown.
   */
  nullability: 'non-nullable' | 'nullable' | 'unknown'
}

/**
 * Kinds that are the type of a value when they are its only non-nullish kind.
 */
let singleKinds = new Set<ValueKind>([
  'function',
  'boolean',
  'string',
  'number',
  'bigint',
  'array',
])

/**
 * Derives the catalog's view of a type from its kinds (catalog 3.2): one
 * primitive, array or function kind is that type, any other set of object kinds
 * is `object`, no kind but `null` and `undefined` is `nullish`, and mixed
 * primitives, `symbol` and any non-nullish value are `unknown`. Nullability
 * comes from the presence of `null` and `undefined`.
 *
 * @param inferred - Kinds of an expression or of a type annotation.
 * @returns Type and nullability of the value.
 */
export function getTypeView(inferred: InferredType): TypeView {
  let { kinds } = inferred
  if (kinds === null) {
    return { nullability: 'unknown', type: 'unknown' }
  }
  let nonNullish = kinds.filter(kind => kind !== 'null' && kind !== 'undefined')
  let nullability: TypeView['nullability'] =
    nonNullish.length === kinds.length ? 'non-nullable' : 'nullable'
  let [first] = nonNullish
  if (!first) {
    return { type: 'nullish', nullability }
  }
  if (nonNullish.length === 1 && singleKinds.has(first)) {
    return { type: first as TypeView['type'], nullability }
  }
  if (nonNullish.every(kind => OBJECT_KINDS.includes(kind))) {
    return { type: 'object', nullability }
  }
  return { type: 'unknown', nullability }
}
