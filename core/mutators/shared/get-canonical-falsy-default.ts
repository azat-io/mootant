import type { Node } from 'oxc-parser'

import type { MutatorContext } from '../../../types/mutator/mutator-context'

import { isCanonicalFalsy } from './is-canonical-falsy'
import { mayBeNullish } from './may-be-nullish'
import { getTypeView } from './get-type-view'

/**
 * Default that is the only falsy value of the value it guards.
 */
export interface CanonicalFalsyDefault {
  /**
   * Why the value is never `NaN` when it is a number, worded as a clause such
   * as "a length is never negative" (see `getValueBound`), or null for a
   * string, BigInt or boolean.
   */
  because: string | null
}

/**
 * Tells whether a default is the only falsy value of the value it guards
 * (catalog 3.3, `canonicalFalsy`), so that `value || fallback` and `value ||=
 * fallback` keep the value, and `value && fallback` and `value &&= fallback`
 * give the default: the type hints make the value a string, BigInt, boolean or
 * number that is never nullish, and the default is `''`, `0n`, `false` or `0`.
 * A number may also be `NaN` or `-0`, which `|| 0` turns into `0`, so it needs
 * a lower bound that is never nullish (see `getValueBound`): such a value is a
 * number of at least the bound, which `NaN` never is, and only a `-0` literal
 * makes it `-0`. A bound that may be nullish is not enough even when an
 * assertion makes the type hints say otherwise.
 *
 * @param value - Left operand or assignment target.
 * @param fallback - Right operand or assigned value.
 * @param context - Mutator context of the file.
 * @returns Why a number is never `NaN` (null for the other types), or null when
 *   the default is not the only falsy value of the value.
 */
export function getCanonicalFalsyDefault(
  value: Node,
  fallback: Node,
  context: MutatorContext,
): CanonicalFalsyDefault | null {
  let type = context.hints.getType(value)
  let view = getTypeView(type)
  if (mayBeNullish(type) || !isCanonicalFalsy(view.type, fallback)) {
    return null
  }
  if (view.type !== 'number') {
    return { because: null }
  }
  let bound = context.syntax.getValueBound(value)
  return bound && !bound.nullable ? { because: bound.because } : null
}
